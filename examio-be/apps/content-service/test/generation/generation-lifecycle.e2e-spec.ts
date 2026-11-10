import { RedisService } from '@examio/redis';
import { GenerationEventsHandler } from '../../src/modules/ai/generation-events.handler';
import { GenerationJobRepository } from '../../src/modules/ai/generation-job.repository';
import { GenerationJobService } from '../../src/modules/ai/generation-job.service';
import type { OutboxService } from '@examio/messaging';
import { connectAsAi, eventually, type TestPublisher } from '../ownership/support/broker';
import { DocumentStatus } from '../ownership/support/fake-document';
import {
    MB,
    ageJob,
    bootContentApp,
    call,
    flashcardItems,
    generate,
    jobRow,
    outboxFor,
    quizItems,
    reap,
    rid,
    teacher,
    type ContentTestApp,
} from './support';

/**
 * The lifecycle of AI generation against real Postgres / Redis / RabbitMQ, with document and ai as real
 * gRPC fakes (so the shared clients, retries and token forwarding run) and the ai-service worker played
 * by a publisher connected as the broker user `ai`. Nothing is charged: a job is inserted QUEUED with
 * its `content.generation.requested` outbox row in one transaction.
 */
describe('generation lifecycle (e2e)', () => {
    let t: ContentTestApp;
    let ai: TestPublisher;

    beforeAll(async () => {
        t = await bootContentApp();
        ai = await connectAsAi();
    });
    afterAll(async () => {
        await ai?.close();
        await t?.close();
    });

    const lockKey = (userId: string, type = 'quiz') => `content:gen:lock:${userId}:${type}`;

    describe('generate-from-file', () => {
        it('a new file: CreateUpload as the user, one job QUEUED with its outbox row, no balance in the answer', async () => {
            const user = await teacher(t);
            const res = await generate(t, user, { bytes: 3 * MB, quantityQuizz: '12', keyword: 'kiến trúc', isNarrowSearch: 'true', modelType: 'gen-b' });

            expect(res.status).toBe(201);
            const jobId = res.body.jobId as string;
            expect(res.body).toEqual({ jobId, status: 'PENDING', message: expect.any(String) });

            const create = t.document.calls.filter((c) => c.rpc === 'CreateUpload' && c.caller === user.id);
            expect(create).toEqual([expect.objectContaining({ reuseDuplicate: true })]);
            expect(t.document.calls.every((c) => !c.caller.startsWith('svc:'))).toBe(true);

            const job = await jobRow(t, jobId);
            expect(job).toMatchObject({ status: 'QUEUED', type: 'quiz', userId: user.id });
            expect(job).not.toHaveProperty('chargeKey');
            const events = await outboxFor(t, 'content.generation.requested', jobId);
            expect(events).toHaveLength(1);
            expect(events[0].envelope).toMatchObject({
                type: 'content.generation.requested',
                source: 'content',
                data: {
                    jobId,
                    userId: user.id,
                    storageId: job.storageId,
                    type: 'quiz',
                    options: { numItems: 12, isNarrowSearch: true, keyword: 'kiến trúc' },
                    model: 'gen-b',
                    downloadUrl: expect.stringContaining('https://r2.test/signed/'),
                    mimetype: 'application/pdf',
                },
            });
        });

        it('submit is atomic: a failed outbox write leaves no job behind, answers 500 and frees the lock', async () => {
            const user = await teacher(t);
            // The very outbox instance the job service writes through.
            const { outbox } = t.app.get(GenerationJobService) as unknown as { outbox: OutboxService };
            const add = jest.spyOn(outbox, 'add').mockRejectedValueOnce(new Error('outbox write failed'));
            try {
                const res = await generate(t, user, { bytes: MB });
                expect(res.status).toBe(500);
            } finally {
                add.mockRestore();
            }
            expect(await t.prisma.generationJob.count({ where: { userId: user.id } })).toBe(0);
            expect((await generate(t, user, { bytes: MB })).status).toBe(201); // lock released
        });

        it('a document-service that cannot sign a URL does not stop the generation: it is queued without downloadUrl', async () => {
            const user = await teacher(t);
            t.document.fault('GetDownloadUrl', 13, 'STORAGE_UNAVAILABLE'); // INTERNAL: not retried
            const res = await generate(t, user, { bytes: MB });
            expect(res.status).toBe(201);
            const [event] = await outboxFor(t, 'content.generation.requested', res.body.jobId);
            expect(JSON.stringify(event.envelope)).not.toContain('downloadUrl');
        });

        it('a flashcard job takes the flashcard quantity and carries no keyword when none was given', async () => {
            const user = await teacher(t);
            const res = await generate(t, user, { typeResult: '2', quantityQuizz: '4', quantityFlashcard: '9' });
            const [event] = await outboxFor(t, 'content.generation.requested', res.body.jobId);
            expect(event.envelope).toMatchObject({ data: { type: 'flashcard', options: { numItems: 9, isNarrowSearch: false }, model: '' } });
            expect(JSON.stringify(event.envelope)).not.toContain('"keyword"');
        });

        it('a reused COMPLETED document is used as it is (no OCR re-queue)', async () => {
            const user = await teacher(t);
            const filename = `reuse-${rid()}.pdf`;
            const doc = t.document.add(user.id, { filename, size: String(MB), processingStatus: DocumentStatus.DOCUMENT_PROCESSING_STATUS_COMPLETED });

            const res = await generate(t, user, { filename, bytes: MB });

            expect(res.status).toBe(201);
            expect(res.body).toMatchObject({ status: 'processing' });
            expect(t.document.calls.filter((c) => c.rpc === 'EnsureProcessed' && c.ids?.[0] === doc.id)).toHaveLength(0);
            expect((await jobRow(t, res.body.jobId)).storageId).toBe(doc.id);
        });

        it.each([
            ['FAILED', DocumentStatus.DOCUMENT_PROCESSING_STATUS_FAILED],
            ['PENDING', DocumentStatus.DOCUMENT_PROCESSING_STATUS_PENDING],
        ])('a reused %s document (e.g. quick-upload, then generate) gets its OCR re-queued before the job', async (_label, processingStatus) => {
            const user = await teacher(t);
            const filename = `quick-${rid()}.pdf`;
            const doc = t.document.add(user.id, { filename, size: String(MB), processingStatus });

            const res = await generate(t, user, { filename, bytes: MB });

            expect(res.status).toBe(201);
            expect(t.document.calls.filter((c) => c.rpc === 'EnsureProcessed' && c.ids?.[0] === doc.id)).toHaveLength(1);
            expect(await jobRow(t, res.body.jobId)).toMatchObject({ status: 'QUEUED', storageId: doc.id });
            expect(await outboxFor(t, 'content.generation.requested', res.body.jobId)).toHaveLength(1);
        });

        it('a reused PROCESSING document with a running job returns that job: no new job', async () => {
            const user = await teacher(t);
            const first = await generate(t, user, { filename: `run-${rid()}.pdf`, bytes: MB });
            const job = await jobRow(t, first.body.jobId);
            t.document.docs.get(job.storageId)!.processingStatus = DocumentStatus.DOCUMENT_PROCESSING_STATUS_PROCESSING;
            // the first job's lock is still held: free it so the second request reaches the running-job branch
            await t.app.get(RedisService).del(lockKey(user.id));

            const second = await generate(t, user, { filename: job.filename, bytes: MB });

            expect(second.status).toBe(201);
            expect(second.body.jobId).toBe(first.body.jobId);
            expect(await t.prisma.generationJob.count({ where: { userId: user.id } })).toBe(1);
        });

        it('many generations in a row are all accepted (no credit or quota gate); one open job per type', async () => {
            const user = await teacher(t);
            for (let i = 0; i < 6; i += 1) {
                const res = await generate(t, user, { bytes: MB });
                expect(res.status).toBe(201);
                await ai.publish('ai.generation.failed', { jobId: res.body.jobId, reason: 'GENERATION_FAILED' });
                await eventually(async () => (await jobRow(t, res.body.jobId)).status === 'FAILED');
            }
            expect((await generate(t, user)).status).toBe(201);
            expect((await generate(t, user)).status).toBe(409);
            expect((await generate(t, user, { typeResult: '2' })).status).toBe(201);
        });

        it('validation errors are refused before anything is stored', async () => {
            const user = await teacher(t);
            expect((await generate(t, user, { quantityQuizz: '51' })).status).toBe(400);
            expect((await generate(t, user, { bytes: 6 * MB })).status).toBe(400);
            expect(t.document.calls.filter((c) => c.caller === user.id)).toEqual([]);
        });

        it('a STUDENT cannot generate (ai:generate stays TEACHER-only)', async () => {
            const student = await t.createUser(['STUDENT']);
            // Tiny body: the guard answers 403 before reading it, and a large upload would hit EPIPE.
            const res = await generate(t, { ...student, token: await t.tokenFor(student) }, { bytes: 1 });
            expect(res.status).toBe(403);
            expect(t.document.calls.filter((c) => c.caller === student.id)).toEqual([]);
        });
    });

    describe('regenerate', () => {
        it('queues a new job on an owned document; a foreign document is 404 and queues nothing', async () => {
            const owner = await teacher(t);
            const other = await teacher(t);
            const doc = t.document.add(owner.id, { filename: 'own.pdf' });

            const res = await call(t.server, 'post', `/ai/regenerate/${doc.id}`, owner.token, { typeResult: 1, quantityQuizz: 25 });
            expect(res.status).toBe(201);
            expect(res.body).not.toHaveProperty('newBalance');
            expect(await jobRow(t, res.body.jobId)).toMatchObject({ status: 'QUEUED', storageId: doc.id, filename: 'own.pdf' });
            expect(await outboxFor(t, 'content.generation.requested', res.body.jobId)).toHaveLength(1);

            expect((await call(t.server, 'post', `/ai/regenerate/${doc.id}`, other.token, { typeResult: 1 })).status).toBe(404);
            expect(await t.prisma.generationJob.count({ where: { userId: other.id } })).toBe(0);
        });

        it('a FAILED document is re-queued (OCR retry) before the new job', async () => {
            const user = await teacher(t);
            const doc = t.document.add(user.id, { processingStatus: DocumentStatus.DOCUMENT_PROCESSING_STATUS_FAILED });
            const res = await call(t.server, 'post', `/ai/regenerate/${doc.id}`, user.token, { typeResult: 2, quantityFlashcard: 10 });
            expect(res.status).toBe(201);
            expect(t.document.calls.filter((c) => c.rpc === 'EnsureProcessed' && c.ids?.[0] === doc.id)).toHaveLength(1);
        });
    });

    describe('events from ai-service', () => {
        async function queuedJob(type: '1' | '2' = '1') {
            const user = await teacher(t);
            const res = await generate(t, user, { typeResult: type, bytes: MB });
            return { user, jobId: res.body.jobId as string };
        }

        it('completed: the history rows are written, the job is COMPLETED, the result is served and the lock is free', async () => {
            const { user, jobId } = await queuedJob();
            const { storageId } = await jobRow(t, jobId);
            await ai.publish('ai.generation.completed', { jobId, type: 'quiz', items: { quizzes: quizItems(3), flashcards: [] } });

            const done = await eventually(async () => {
                const job = await jobRow(t, jobId);
                return job.status === 'COMPLETED' ? job : null;
            });
            const history = await t.prisma.historyGeneratedQuizz.findUniqueOrThrow({ where: { id: done.historyId! } });
            expect(history).toMatchObject({ userId: user.id, userStorageId: storageId });
            expect(history.quizzes).toEqual(quizItems(3));

            const status = await call(t.server, 'get', `/ai/job/${jobId}`, user.token);
            expect(status.body).toMatchObject({ jobId, status: 'completed', result: { type: 'quiz', historyId: history.id, fileInfo: { id: storageId } } });
            expect((await call(t.server, 'get', `/ai/job/${storageId}`, user.token)).body).toMatchObject({ jobId, status: 'completed' });

            // a second event for the finished job changes nothing
            await ai.publish('ai.generation.completed', { jobId, type: 'quiz', items: { quizzes: quizItems(2), flashcards: [] } });
            await new Promise((resolve) => setTimeout(resolve, 1500));
            expect(await t.prisma.historyGeneratedQuizz.count({ where: { userStorageId: storageId } })).toBe(1);
            expect((await generate(t, user, { bytes: MB })).status).toBe(201); // lock released
        });

        it('the generation lock is released only after the consumer transaction commits; a rolled-back completion leaves it held', async () => {
            const { user, jobId } = await queuedJob();
            const handler = t.app.get(GenerationEventsHandler);
            const repo = t.app.get(GenerationJobRepository);
            const envelope = {
                id: `evt_${rid()}`,
                type: 'ai.generation.completed',
                version: 1,
                occurredAt: '',
                source: 'ai',
                correlationId: 'c',
                data: { jobId, type: 'quiz', items: { quizzes: quizItems(2), flashcards: [] } },
            } as never;
            const redis = t.app.get(RedisService);
            expect(await redis.getClient().exists(lockKey(user.id))).toBe(1);

            const write = jest.spyOn(repo, 'createQuizHistory').mockRejectedValueOnce(new Error('db failed mid-transaction'));
            await expect(handler.onCompleted(envelope)).rejects.toThrow('db failed mid-transaction');
            write.mockRestore();

            expect((await jobRow(t, jobId)).status).toBe('QUEUED');
            expect(await redis.getClient().exists(lockKey(user.id))).toBe(1);
            expect((await generate(t, user, { bytes: MB })).status).toBe(409);

            await handler.onCompleted(envelope);
            expect((await jobRow(t, jobId)).status).toBe('COMPLETED');
            expect(await redis.getClient().exists(lockKey(user.id))).toBe(0);
            await handler.onCompleted(envelope); // a replay changes nothing
            expect(await t.prisma.historyGeneratedQuizz.count({ where: { userId: user.id } })).toBe(1);
        });

        it('a flashcard job writes flashcard history', async () => {
            const { user, jobId } = await queuedJob('2');
            await ai.publish('ai.generation.completed', { jobId, type: 'flashcard', items: { quizzes: [], flashcards: flashcardItems(4) } });
            const done = await eventually(async () => {
                const job = await jobRow(t, jobId);
                return job.status === 'COMPLETED' ? job : null;
            });
            const history = await t.prisma.historyGeneratedFlashcard.findUniqueOrThrow({ where: { id: done.historyId! } });
            expect(history.flashcards).toEqual(flashcardItems(4));
            expect((await call(t.server, 'get', `/ai/job/${jobId}`, user.token)).body.result).toMatchObject({ type: 'flashcard' });
        });

        it('failed: the job is FAILED, a replay changes nothing, the job reads as failed and the lock is free', async () => {
            const { user, jobId } = await queuedJob();
            await ai.publish('ai.generation.failed', { jobId, reason: 'MODEL_UNAVAILABLE' });
            await eventually(async () => (await jobRow(t, jobId)).status === 'FAILED');
            await ai.publish('ai.generation.failed', { jobId, reason: 'OTHER' });
            await new Promise((resolve) => setTimeout(resolve, 1500));

            expect(await jobRow(t, jobId)).toMatchObject({ status: 'FAILED', error: 'MODEL_UNAVAILABLE' });
            const status = await call(t.server, 'get', `/ai/job/${jobId}`, user.token);
            expect(status.body).toMatchObject({ jobId, status: 'failed', error: 'Model hiện tại không khả dụng, thử model khác.' });
            expect((await generate(t, user, { bytes: MB })).status).toBe(201); // lock released
        });

        it('an event for an unknown job is ignored', async () => {
            await ai.publish('ai.generation.failed', { jobId: `nope_${rid()}`, reason: 'X' });
            await ai.publish('ai.generation.completed', { jobId: `nope_${rid()}`, type: 'quiz', items: { quizzes: quizItems(1), flashcards: [] } });
            await new Promise((resolve) => setTimeout(resolve, 1000));
            expect((await call(t.server, 'get', '/ai/models', (await teacher(t)).token)).status).toBe(200);
        });
    });

    describe('watchdog (jobs ai-service never answered)', () => {
        // The reaper scans the whole table: open jobs left by earlier tests or runs would inflate timedOut.
        beforeEach(async () => {
            await t.prisma.generationJob.deleteMany({ where: { status: { in: ['QUEUED', 'PROCESSING'] } } });
        });

        async function silentJob(status: 'QUEUED' | 'PROCESSING' = 'QUEUED') {
            const user = await teacher(t);
            const { jobId } = (await generate(t, user, { bytes: MB })).body;
            if (status === 'PROCESSING') await t.prisma.generationJob.update({ where: { id: jobId }, data: { status } });
            return { user, jobId: jobId as string };
        }

        it.each(['QUEUED', 'PROCESSING'] as const)('a %s job silent for more than the timeout is FAILED GENERATION_TIMEOUT and frees the lock', async (status) => {
            const { user, jobId } = await silentJob(status);
            await ageJob(t, jobId, 61);

            expect(await reap(t)).toEqual({ timedOut: 1 });
            expect(await reap(t)).toEqual({ timedOut: 0 }); // a second pass changes nothing

            expect(await jobRow(t, jobId)).toMatchObject({ status: 'FAILED', error: 'GENERATION_TIMEOUT' });
            expect((await call(t.server, 'get', `/ai/job/${jobId}`, user.token)).body).toMatchObject({ status: 'failed' });
            expect((await generate(t, user, { bytes: MB })).status).toBe(201); // lock released
        });

        it('a job younger than the timeout is untouched', async () => {
            const { jobId } = await silentJob();
            await ageJob(t, jobId, 59);
            await reap(t);
            expect((await jobRow(t, jobId)).status).toBe('QUEUED');
        });

        it('late completed / failed events after the watchdog fired write no history', async () => {
            const { jobId } = await silentJob();
            const { storageId } = await jobRow(t, jobId);
            await ageJob(t, jobId, 61);
            await reap(t);

            await ai.publish('ai.generation.completed', { jobId, type: 'quiz', items: { quizzes: quizItems(2), flashcards: [] } });
            await ai.publish('ai.generation.failed', { jobId, reason: 'GENERATION_FAILED' });
            await new Promise((resolve) => setTimeout(resolve, 1500));

            expect(await jobRow(t, jobId)).toMatchObject({ status: 'FAILED', error: 'GENERATION_TIMEOUT' });
            expect(await t.prisma.historyGeneratedQuizz.count({ where: { userStorageId: storageId } })).toBe(0);
        });
    });

    describe('cancel', () => {
        it('cancelling a QUEUED job frees the lock; cancelling again is 200', async () => {
            const user = await teacher(t);
            const { body } = await generate(t, user, { bytes: MB });

            const first = await call(t.server, 'delete', `/ai/job/${body.jobId}`, user.token);
            expect(first.status).toBe(200);
            expect(first.body).toMatchObject({ success: true });
            expect((await jobRow(t, body.jobId)).status).toBe('CANCELLED');

            expect((await call(t.server, 'delete', `/ai/job/${body.jobId}`, user.token)).status).toBe(200);
            expect((await call(t.server, 'get', `/ai/job/${body.jobId}`, user.token)).body).toMatchObject({ status: 'failed' });
            expect((await generate(t, user, { bytes: MB })).status).toBe(201);
        });

        it('cancelling a COMPLETED or FAILED job is 409 JOB_NOT_CANCELLABLE', async () => {
            const user = await teacher(t);
            const done = (await generate(t, user, { bytes: MB })).body.jobId as string;
            await ai.publish('ai.generation.completed', { jobId: done, type: 'quiz', items: { quizzes: quizItems(2), flashcards: [] } });
            await eventually(async () => (await jobRow(t, done)).status === 'COMPLETED');
            const failed = (await generate(t, user, { bytes: MB })).body.jobId as string;
            await ai.publish('ai.generation.failed', { jobId: failed, reason: 'GENERATION_FAILED' });
            await eventually(async () => (await jobRow(t, failed)).status === 'FAILED');

            for (const id of [done, failed]) {
                const res = await call(t.server, 'delete', `/ai/job/${id}`, user.token);
                expect(res.status).toBe(409);
                expect(res.body).toMatchObject({ code: 'JOB_NOT_CANCELLABLE' });
            }
        });

        it('a result that arrives after the cancel writes no history', async () => {
            const user = await teacher(t);
            const { jobId } = (await generate(t, user, { bytes: MB })).body;
            const { storageId } = await jobRow(t, jobId);
            await call(t.server, 'delete', `/ai/job/${jobId}`, user.token);

            await ai.publish('ai.generation.completed', { jobId, type: 'quiz', items: { quizzes: quizItems(2), flashcards: [] } });
            await new Promise((resolve) => setTimeout(resolve, 1500));

            expect((await jobRow(t, jobId)).status).toBe('CANCELLED');
            expect(await t.prisma.historyGeneratedQuizz.count({ where: { userStorageId: storageId } })).toBe(0);
        });

        it('another user cannot cancel or read the job (404)', async () => {
            const owner = await teacher(t);
            const other = await teacher(t);
            const { jobId } = (await generate(t, owner, { bytes: MB })).body;
            expect((await call(t.server, 'delete', `/ai/job/${jobId}`, other.token)).status).toBe(404);
            expect((await call(t.server, 'get', `/ai/job/${jobId}`, other.token)).status).toBe(404);
            expect((await jobRow(t, jobId)).status).toBe('QUEUED');
        });
    });

    describe('history of a document', () => {
        it('upload/:id/history reads the owner history only and needs ownership from document-service', async () => {
            const owner = await teacher(t);
            const other = await teacher(t);
            const doc = t.document.add(owner.id, { filename: 'h.pdf' });
            await t.prisma.historyGeneratedQuizz.create({ data: { id: `h_${rid()}`, userId: owner.id, userStorageId: doc.id, quizzes: quizItems(2) } });

            const mine = await call(t.server, 'get', `/ai/upload/${doc.id}/history`, owner.token);
            expect(mine.status).toBe(200);
            expect(mine.body).toMatchObject({ uploadId: doc.id, filename: 'h.pdf', flashcardHistory: null });
            expect(mine.body.quizHistory.quizzes).toHaveLength(2);
            expect((await call(t.server, 'get', `/ai/upload/${doc.id}/history`, other.token)).status).toBe(404);
        });
    });

    it('every document-service call content made carried a user token (a service token would have been refused)', () => {
        expect(t.document.calls.length).toBeGreaterThan(0);
        expect(t.document.calls.filter((c) => c.caller.startsWith('svc:'))).toEqual([]);
    });
});
