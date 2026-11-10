import * as amqp from 'amqplib';
import { EVENTS_EXCHANGE, type Envelope } from '@examio/messaging';
import { bootAiChatApp, rid, type AiChatTestApp } from './support/ai-chat-test-app';
import { connectPublisher, eventually } from './support/broker';
import { chatWith, teacher } from './support/helpers';
import { DocumentDeletedHandler } from '../src/modules/events/document-deleted.handler';

/**
 * The `aichat.events` consumer against a REAL RabbitMQ started from the rendered
 * deploy/rabbitmq/definitions.template.json (the file production uses):
 *   RABBITMQ_URL            amqp://aichat:<RABBITMQ_AICHAT_PASS>@host   (the app's own user)
 *   RABBITMQ_DOCUMENT_URL   amqp://document:<RABBITMQ_DOCUMENT_PASS>@host (publishes document.deleted)
 *   RABBITMQ_FINANCE_URL    amqp://finance:<RABBITMQ_FINANCE_PASS>@host   (publishes finance.subscription.changed)
 * Under CI=true a missing URL FAILS the suite instead of skipping it.
 */
const urls = {
    aichat: process.env.RABBITMQ_URL,
    document: process.env.RABBITMQ_DOCUMENT_URL,
    finance: process.env.RABBITMQ_FINANCE_URL,
};
const enabled = Boolean(urls.aichat && urls.document && urls.finance);
const describeBroker = enabled
    ? describe
    : process.env.CI === 'true'
      ? (name: string) =>
            describe(name, () => {
                it('requires RABBITMQ_URL, RABBITMQ_DOCUMENT_URL and RABBITMQ_FINANCE_URL in CI (refusing to skip)', () => {
                    throw new Error('the three broker URLs must be set when CI=true');
                });
            })
      : describe.skip;

describeBroker('ai-chat events (e2e)', () => {
    let t: AiChatTestApp;

    beforeAll(async () => {
        t = await bootAiChatApp();
        // let the consumer bind before the first publish
        await new Promise((resolve) => setTimeout(resolve, 1500));
    });
    afterAll(() => t?.close());

    const links = (chatId: string) => t.prisma.aIChatDocument.findMany({ where: { chatId }, orderBy: { documentId: 'asc' } });

    describe('document.deleted', () => {
        it('removes the links of the deleted documents only, and a redelivery of the same event is a no-op', async () => {
            const user = await teacher(t);
            const keep = `doc_${rid()}`;
            const gone = `doc_${rid()}`;
            const chat = await chatWith(t, user.id, [
                { id: keep, name: 'keep.pdf' },
                { id: gone, name: 'gone.pdf' },
            ]);
            const publisher = await connectPublisher(urls.document as string);
            try {
                const first = await publisher.publish('document.deleted', { storageIds: [gone], userId: user.id });
                await eventually(async () => (await links(chat.id)).length === 1);
                expect((await links(chat.id)).map((l) => l.documentId)).toEqual([keep]);
                expect(await t.prisma.processedEvent.count({ where: { consumer: 'aichat', eventId: first.id } })).toBe(1);

                // a link added afterwards must survive a redelivery of the SAME event id
                await t.prisma.aIChatDocument.create({ data: { chatId: chat.id, documentId: gone, documentName: 'again.pdf' } });
                const redelivered = { id: first.id, type: 'document.deleted', source: 'document', version: 1, occurredAt: new Date().toISOString(), correlationId: 'c', data: { storageIds: [gone], userId: user.id } } as unknown as Envelope;
                const conn = await amqp.connect(urls.document as string);
                const ch = await conn.createConfirmChannel();
                await new Promise<void>((resolve, reject) =>
                    ch.publish(EVENTS_EXCHANGE, 'document.deleted', Buffer.from(JSON.stringify(redelivered)), { persistent: true, messageId: first.id }, (e) => (e ? reject(e) : resolve()))
                );
                await conn.close();
                await new Promise((resolve) => setTimeout(resolve, 1500));
                expect((await links(chat.id)).map((l) => l.documentId).sort()).toEqual([gone, keep].sort());
            } finally {
                await publisher.close();
            }
        });

        it('is a no-op for a chat that is already gone (and for ids nobody linked)', async () => {
            const user = await teacher(t);
            const orphan = `doc_${rid()}`;
            const chat = await chatWith(t, user.id, [{ id: orphan, name: 'o.pdf' }]);
            await t.prisma.aIChat.delete({ where: { id: chat.id } });
            const publisher = await connectPublisher(urls.document as string);
            try {
                const { id } = await publisher.publish('document.deleted', { storageIds: [orphan, `doc_${rid()}`], userId: user.id });
                await eventually(async () => (await t.prisma.processedEvent.count({ where: { consumer: 'aichat', eventId: id } })) === 1);
            } finally {
                await publisher.close();
            }
        });

        it('calling the handler twice (a redelivery) deletes nothing the second time', async () => {
            const user = await teacher(t);
            const docId = `doc_${rid()}`;
            const chat = await chatWith(t, user.id, [{ id: docId, name: 'x.pdf' }]);
            const handler = t.app.get(DocumentDeletedHandler);
            const envelope = { id: `evt_${rid()}`, type: 'document.deleted', version: 1, occurredAt: '', source: 'document', correlationId: 'c', data: { storageIds: [docId], userId: user.id } } as unknown as Envelope;
            for (let i = 0; i < 2; i++) await t.prisma.$transaction((tx) => handler.onDocumentDeleted(envelope, tx));
            expect(await links(chat.id)).toEqual([]);
        });

        it('a malformed payload is dead-lettered (aichat.dlq), not retried forever', async () => {
            const publisher = await connectPublisher(urls.document as string);
            const admin = await amqp.connect(urls.aichat as string);
            const ch = await admin.createChannel();
            try {
                const before = (await ch.checkQueue('aichat.dlq')).messageCount;
                await publisher.publish('document.deleted', { storageIds: 'not-an-array' });
                await eventually(async () => (await ch.checkQueue('aichat.dlq')).messageCount > before, 15_000);
            } finally {
                await admin.close().catch(() => undefined);
                await publisher.close();
            }
        });
    });

    describe('finance.subscription.changed', () => {
        it('deletes the cached benefits of that user, and of no other', async () => {
            const user = await teacher(t);
            const bystander = await teacher(t);
            for (const u of [user, bystander]) await t.redis.set(`aichat:benefits:${u.id}`, { tier: 0, tierName: 'Free', filesPerMonth: 5, messagesPerMinute: 5, chatMessagesLimit: 30 }, 300);
            const publisher = await connectPublisher(urls.finance as string);
            try {
                await publisher.publish('finance.subscription.changed', { userId: user.id, fromTier: 0, toTier: 2, at: Date.now(), version: Date.now() });
                await eventually(async () => (await t.redis.get(`aichat:benefits:${user.id}`)) === null);
                expect(await t.redis.get(`aichat:benefits:${bystander.id}`)).not.toBeNull();
            } finally {
                await publisher.close();
            }
        });

        it('the next message reads the new plan: a Free-capped user is released by the event', async () => {
            const user = await teacher(t);
            t.finance.setBenefits(user.id, { tier: 0, messagesPerMinute: 1 });
            const chat = await chatWith(t, user.id);
            const send = () => import('./support/http').then(({ call }) => call(t.server, 'post', `/ai-chat/${chat.id}/message`, user.token, { message: 'hi' }));
            expect((await send()).status).toBeLessThan(300);
            expect((await send()).status).toBe(429);

            t.finance.setBenefits(user.id, { tier: 2, messagesPerMinute: 100 });
            const publisher = await connectPublisher(urls.finance as string);
            try {
                await publisher.publish('finance.subscription.changed', { userId: user.id, fromTier: 0, toTier: 2, at: Date.now(), version: Date.now() });
                await eventually(async () => (await t.redis.get(`aichat:benefits:${user.id}`)) === null);
                expect((await send()).status).toBeLessThan(300);
            } finally {
                await publisher.close();
            }
        });
    });

    describe('broker permissions of the aichat user', () => {
        const refusal = async (action: (ch: amqp.ConfirmChannel) => unknown): Promise<string | null> => {
            const connection = await amqp.connect(urls.aichat as string);
            connection.on('error', () => undefined);
            try {
                const ch = await connection.createConfirmChannel();
                const closed = new Promise<string>((resolve) => ch.once('error', (err: Error) => resolve(err.message)));
                await Promise.resolve(action(ch)).catch(() => undefined);
                return await Promise.race([closed, new Promise<null>((resolve) => setTimeout(() => resolve(null), 600))]);
            } finally {
                await connection.close().catch(() => undefined);
            }
        };

        it('publishing document.deleted or finance.subscription.changed is ACCESS_REFUSED (only ^aichat\\. may be published)', async () => {
            for (const key of ['document.deleted', 'finance.subscription.changed', 'auth.user.updated']) {
                expect(await refusal((ch) => ch.publish(EVENTS_EXCHANGE, key, Buffer.from('{}'), { persistent: true }))).toMatch(/ACCESS_REFUSED/);
            }
        });

        it('reading another service queue or declaring one is ACCESS_REFUSED; its own queue is fine', async () => {
            expect(await refusal((ch) => ch.consume('document.events', () => undefined))).toMatch(/ACCESS_REFUSED/);
            expect(await refusal((ch) => ch.assertQueue('exam.events', { durable: true }))).toMatch(/ACCESS_REFUSED/);
            expect(await refusal((ch) => ch.consume('aichat.events', () => undefined))).toBeNull();
        });
    });
});
