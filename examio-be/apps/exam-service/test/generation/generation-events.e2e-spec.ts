import { Test } from '@nestjs/testing';
import { connect } from 'amqplib';
import { MessagingModule } from '@examio/messaging';
import { EXAM_MESSAGING } from '../../src/messaging/exam-messaging';
import { GenerationEventsHandler } from '../../src/modules/ai/generation-events.handler';
import { connectPublisher, eventually } from '../ownership/support/broker';
import { bootExamApp, generate, jobRow, outboxFor, quizItems, rid, teacher, type ExamTestApp } from './support';

/**
 * The outbox side and the document lifecycle consumer against a real broker with the real permissions:
 * `content.generation.requested` leaves exam with `source=content`, published by the broker user `exam`,
 * and `document.deleted` is consumed idempotently.
 */
describe('generation events on the broker (e2e)', () => {
    let t: ExamTestApp;

    beforeAll(async () => {
        t = await bootExamApp();
    });
    afterAll(() => t?.close());

    it('the relay (worker role, broker user exam) publishes content.generation.requested with source=content', async () => {
        const user = await teacher(t, 100);
        const { jobId } = (await generate(t, user, { keyword: 'k' })).body;
        const [row] = await outboxFor(t, 'content.generation.requested', jobId);
        expect(row).toMatchObject({ source: 'content', publishedAt: null });

        // A probe queue bound as the same broker user: only `exam.*` queues are configurable by it.
        const url = process.env.RABBITMQ_URL as string;
        const conn = await connect(url);
        const ch = await conn.createChannel();
        const probe = `exam.probe.${rid()}`;
        await ch.assertQueue(probe, { durable: false, autoDelete: true });
        await ch.bindQueue(probe, 'examio.events', 'content.generation.requested');

        const worker = await Test.createTestingModule({
            imports: [MessagingModule.forRoot({ ...EXAM_MESSAGING, relay: true })],
        }).compile();
        const relayApp = worker.createNestApplication();
        await relayApp.init();
        try {
            const published = await eventually(async () => {
                const current = await t.prisma.outboxEvent.findUnique({ where: { seq: row.seq } });
                return current?.publishedAt ? current : null;
            });
            expect(published.attempts).toBe(0);

            const messages: Array<{ key: string; body: Record<string, any> }> = [];
            await eventually(async () => {
                for (;;) {
                    const msg = await ch.get(probe, { noAck: true });
                    if (!msg) break;
                    messages.push({ key: msg.fields.routingKey, body: JSON.parse(msg.content.toString()) });
                }
                return messages.some((m) => m.body.data?.jobId === jobId);
            });
            const mine = messages.filter((m) => m.body.data?.jobId === jobId);
            expect(mine).toHaveLength(1);
            expect(mine[0].key).toBe('content.generation.requested');
            expect(mine[0].body).toMatchObject({
                type: 'content.generation.requested',
                source: 'content',
                version: 1,
                id: (row.envelope as { id: string }).id,
                data: { jobId, userId: user.id, type: 'quiz', options: { numItems: 10, isNarrowSearch: false, keyword: 'k' }, model: '' },
            });
        } finally {
            await relayApp.close();
            await ch.close().catch(() => undefined);
            await conn.close().catch(() => undefined);
        }
    });

    it('the broker user exam may not publish another domain (the permission the source rule relies on)', async () => {
        const publisher = await connectPublisher(process.env.RABBITMQ_URL as string);
        try {
            await expect(
                Promise.race([
                    publisher.publish('ai.generation.completed', { jobId: 'x' }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('refused: no confirm')), 3000)),
                ])
            ).rejects.toBeDefined();
        } finally {
            await publisher.close();
        }
    });

    describe('document.deleted', () => {
        const documentUser = () => connectPublisher(process.env.RABBITMQ_DOCUMENT_URL as string);

        async function seed() {
            const user = await teacher(t);
            const storageId = `doc_${rid()}`;
            const other = `doc_${rid()}`;
            const history = (userStorageId: string, userId = user.id) =>
                t.prisma.historyGeneratedQuizz.create({ data: { id: `h_${rid()}`, userId, userStorageId, quizzes: quizItems(1) } });
            const gone = await history(storageId);
            const kept = await history(other);
            const goneFlash = await t.prisma.historyGeneratedFlashcard.create({
                data: { id: `f_${rid()}`, userId: user.id, userStorageId: storageId, flashcards: [] },
            });
            const chat = await t.prisma.aIChat.create({ data: { id: `c_${rid()}`, userId: user.id, title: 't' } });
            await t.prisma.aIChatDocument.createMany({
                data: [
                    { chatId: chat.id, documentId: storageId, documentName: 'gone.pdf' },
                    { chatId: chat.id, documentId: other, documentName: 'kept.pdf' },
                ],
            });
            return { user, storageId, other, gone, kept, goneFlash, chat };
        }

        it('detaches generated history (rows stay), removes ai-chat links, leaves other documents alone; replays change nothing', async () => {
            const s = await seed();
            const publisher = await documentUser();
            try {
                await publisher.publish('document.deleted', { storageIds: [s.storageId], userId: s.user.id });
                await eventually(async () => (await t.prisma.historyGeneratedQuizz.findUnique({ where: { id: s.gone.id } }))?.userStorageId === null);

                expect(await t.prisma.historyGeneratedFlashcard.findUnique({ where: { id: s.goneFlash.id } })).toMatchObject({ userStorageId: null });
                expect(await t.prisma.historyGeneratedQuizz.findUnique({ where: { id: s.kept.id } })).toMatchObject({ userStorageId: s.other });
                const links = await t.prisma.aIChatDocument.findMany({ where: { chatId: s.chat.id } });
                expect(links.map((l) => l.documentId)).toEqual([s.other]);

                // the same ids announced again (a second event, as after a redelivery of a different message)
                await publisher.publish('document.deleted', { storageIds: [s.storageId], userId: s.user.id });
                await new Promise((resolve) => setTimeout(resolve, 1200));
                expect(await t.prisma.aIChatDocument.count({ where: { chatId: s.chat.id } })).toBe(1);
                expect(await t.prisma.historyGeneratedQuizz.count({ where: { id: s.gone.id } })).toBe(1);
            } finally {
                await publisher.close();
            }
        });

        it('only the announced owner history is detached (an id collision never touches another user)', async () => {
            const s = await seed();
            const stranger = await teacher(t);
            const foreign = await t.prisma.historyGeneratedQuizz.create({
                data: { id: `h_${rid()}`, userId: stranger.id, userStorageId: s.storageId, quizzes: [] },
            });
            const publisher = await documentUser();
            try {
                await publisher.publish('document.deleted', { storageIds: [s.storageId], userId: s.user.id });
                await eventually(async () => (await t.prisma.historyGeneratedQuizz.findUnique({ where: { id: s.gone.id } }))?.userStorageId === null);
                expect(await t.prisma.historyGeneratedQuizz.findUnique({ where: { id: foreign.id } })).toMatchObject({ userStorageId: s.storageId });
            } finally {
                await publisher.close();
            }
        });

        it('calling the handler directly twice (a redelivery) is a no-op the second time', async () => {
            const s = await seed();
            const handler = t.app.get(GenerationEventsHandler);
            const envelope = { id: 'evt_x', type: 'document.deleted', version: 1, occurredAt: '', source: 'document', correlationId: 'c', data: { storageIds: [s.storageId], userId: s.user.id } } as const;
            for (let i = 0; i < 2; i++) await t.prisma.$transaction((tx) => handler.onDocumentDeleted(envelope, tx));
            expect(await t.prisma.aIChatDocument.count({ where: { chatId: s.chat.id } })).toBe(1);
            expect(await t.prisma.historyGeneratedQuizz.findUnique({ where: { id: s.gone.id } })).toMatchObject({ userStorageId: null });
        });

        it('a malformed document.deleted payload is dead-lettered, not retried forever', async () => {
            const publisher = await documentUser();
            try {
                await publisher.publish('document.deleted', { storageIds: 'oops' });
                await new Promise((resolve) => setTimeout(resolve, 1000));
                const conn = await connect(process.env.RABBITMQ_URL as string);
                const ch = await conn.createChannel();
                try {
                    const q = await ch.checkQueue('exam.dlq');
                    expect(q.messageCount).toBeGreaterThanOrEqual(1);
                } finally {
                    await ch.close().catch(() => undefined);
                    await conn.close().catch(() => undefined);
                }
            } finally {
                await publisher.close();
            }
        });
    });

    it('jobRow helper stays tied to the shared app (smoke)', async () => {
        const user = await teacher(t, 100);
        const { jobId } = (await generate(t, user)).body;
        expect((await jobRow(t, jobId)).status).toBe('QUEUED');
    });
});
