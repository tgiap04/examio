import { RedisService } from '@examio/redis';
import { GenerationChargeService } from '../../src/modules/ai/generation-charge.service';
import { GenerationEventsHandler } from '../../src/modules/ai/generation-events.handler';
import { GenerationJobRepository } from '../../src/modules/ai/generation-job.repository';
import { GenerationJobService } from '../../src/modules/ai/generation-job.service';
import { connectAsAi, eventually, type TestPublisher } from '../ownership/support/broker';
import { DocumentStatus } from '../ownership/support/fake-document';
import {
    MB,
    ageJob,
    bootExamApp,
    call,
    flashcardItems,
    generate,
    jobRow,
    outboxFor,
    quizItems,
    reap,
    rid,
    teacher,
    type ExamTestApp,
} from './support';

/**
 * The money of AI generation against real Postgres / Redis / RabbitMQ, with finance, document and ai as
 * real gRPC fakes (so the shared clients, retries and token forwarding run) and the ai-service worker
 * played by a publisher connected as the broker user `ai`.
 *
 * Invariant: one Debit(gen:<jobId>) per job, one effective Refund at most, never both a free generation
 * and a charge: every path below ends with the balance the user is owed.
 */
describe('generation money flow (e2e)', () => {
    let t: ExamTestApp;
    let ai: TestPublisher;

    beforeAll(async () => {
        t = await bootExamApp();
        ai = await connectAsAi();
    });
    afterAll(async () => {
        await ai?.close();
        await t?.close();
    });

    const balance = (userId: string) => t.finance.balances.get(userId);
    const refunded = (key: string) => t.finance.refunds.has(key);

    describe('generate-from-file', () => {
        it('a new file is ONE Debit(gen:<jobId>) for upload + generation, charged as the user, after CreateUpload(charge_credits=false)', async () => {
            const user = await teacher(t, 100);
            const res = await generate(t, user, { bytes: 3 * MB, quantityQuizz: '12', keyword: 'kiến trúc', isNarrowSearch: 'true', modelType: 'gen-b' });

            expect(res.status).toBe(201);
            const jobId = res.body.jobId as string;
            expect(res.body).toMatchObject({ status: 'PENDING', newBalance: 93 }); // ceil(3MB / 2MB) + 5 = 7

            const debits = t.finance.calls.filter((c) => c.rpc === 'Debit' && c.userId === user.id);
            expect(debits).toEqual([expect.objectContaining({ key: `gen:${jobId}`, amount: 7, caller: user.id })]);
            expect(balance(user.id)).toBe(93);

            const create = t.document.calls.filter((c) => c.rpc === 'CreateUpload' && c.caller === user.id);
            expect(create).toEqual([expect.objectContaining({ chargeCredits: false, reuseDuplicate: true })]);
            // exam never calls document-service as a service
            expect(t.document.calls.every((c) => !c.caller.startsWith('svc:'))).toBe(true);

            const job = await jobRow(t, jobId);
            expect(job).toMatchObject({ status: 'QUEUED', chargedAmount: 7, chargeKey: `gen:${jobId}`, type: 'quiz', userId: user.id, refundedAt: null });
            const [event] = await outboxFor(t, 'content.generation.requested', jobId);
            expect(event.source).toBe('content');
            expect(event.envelope).toMatchObject({
                type: 'content.generation.requested',
                source: 'content',
                data: {
                    jobId,
                    userId: user.id,
                    storageId: job.storageId,
                    type: 'quiz',
                    options: { numItems: 12, isNarrowSearch: true, keyword: 'kiến trúc' },
                    model: 'gen-b',
                    // M2: ai-service can process a document that has no chunks yet from this URL
                    downloadUrl: expect.stringContaining('https://r2.test/signed/'),
                    mimetype: 'application/pdf',
                },
            });
            expect(t.document.calls.filter((c) => c.rpc === 'GetDownloadUrl' && c.ids?.[0] === job.storageId && c.caller === user.id)).toHaveLength(1);
        });

        it('a document-service that cannot sign a URL does not stop the generation: it is queued without downloadUrl', async () => {
            const user = await teacher(t, 100);
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

        it('a reused COMPLETED document pays the generation only (5)', async () => {
            const user = await teacher(t, 20);
            const filename = `reuse-${rid()}.pdf`;
            const doc = t.document.add(user.id, { filename, size: String(MB), processingStatus: DocumentStatus.DOCUMENT_PROCESSING_STATUS_COMPLETED });

            const res = await generate(t, user, { filename, bytes: MB });

            expect(res.status).toBe(201);
            expect(res.body).toMatchObject({ status: 'processing', newBalance: 15 });
            const debits = t.finance.calls.filter((c) => c.rpc === 'Debit' && c.userId === user.id);
            expect(debits).toEqual([expect.objectContaining({ key: `gen:${res.body.jobId}`, amount: 5 })]);
            expect(t.document.calls.filter((c) => c.rpc === 'EnsureProcessed' && c.ids?.[0] === doc.id)).toHaveLength(0);
            expect((await jobRow(t, res.body.jobId)).storageId).toBe(doc.id);
        });

        it.each([
            ['FAILED', DocumentStatus.DOCUMENT_PROCESSING_STATUS_FAILED],
            ['PENDING', DocumentStatus.DOCUMENT_PROCESSING_STATUS_PENDING],
        ])('M1: a reused %s document (e.g. quick-upload, then generate) is charged the 5 credits and its OCR re-queued', async (_label, processingStatus) => {
            const user = await teacher(t, 20);
            const filename = `quick-${rid()}.pdf`;
            const doc = t.document.add(user.id, { filename, size: String(MB), processingStatus });

            const res = await generate(t, user, { filename, bytes: MB });

            expect(res.status).toBe(201);
            expect(res.body).toMatchObject({ newBalance: 15 });
            expect(t.finance.calls.filter((c) => c.rpc === 'Debit' && c.userId === user.id)).toEqual([
                expect.objectContaining({ key: `gen:${res.body.jobId}`, amount: 5 }),
            ]);
            expect(balance(user.id)).toBe(15);
            expect(t.document.calls.filter((c) => c.rpc === 'EnsureProcessed' && c.ids?.[0] === doc.id)).toHaveLength(1);
            expect(await jobRow(t, res.body.jobId)).toMatchObject({ status: 'QUEUED', chargedAmount: 5 });
            expect(await outboxFor(t, 'content.generation.requested', res.body.jobId)).toHaveLength(1);
        });

        it('M1: a failed CHARGED generation is refunded once, and the retry of the same document pays the 5 credits again (no free retry)', async () => {
            const user = await teacher(t, 100);
            const filename = `retry-${rid()}.pdf`;
            const first = await generate(t, user, { filename, bytes: MB });
            expect(first.status).toBe(201);
            expect(balance(user.id)).toBe(94);
            const { storageId } = await jobRow(t, first.body.jobId);
            await ai.publish('ai.generation.failed', { jobId: first.body.jobId, reason: 'OCR_FAILED' });
            await eventually(async () => (await jobRow(t, first.body.jobId)).refundedAt);
            expect(balance(user.id)).toBe(100);
            expect(t.finance.count('Refund', `gen:${first.body.jobId}`)).toBe(1);
            t.document.docs.get(storageId)!.processingStatus = DocumentStatus.DOCUMENT_PROCESSING_STATUS_FAILED;

            const retry = await generate(t, user, { filename, bytes: MB });

            expect(retry.status).toBe(201);
            expect(t.finance.calls.filter((c) => c.rpc === 'Debit' && c.key === `gen:${retry.body.jobId}`)).toEqual([
                expect.objectContaining({ amount: 5 }),
            ]);
            expect(balance(user.id)).toBe(95);
            expect(t.finance.count('Refund', `gen:${first.body.jobId}`)).toBe(1);
            expect(t.document.calls.filter((c) => c.rpc === 'EnsureProcessed' && c.ids?.[0] === storageId)).toHaveLength(1);
            expect(await jobRow(t, retry.body.jobId)).toMatchObject({ status: 'QUEUED', chargedAmount: 5, storageId });
        });

        it('a refused (never charged) generation: the retry of the reused document pays and the refused job keeps chargedAmount 0', async () => {
            const user = await teacher(t, 2); // not enough for 5
            const filename = `refused-${rid()}.pdf`;
            const doc = t.document.add(user.id, { filename, size: String(MB), processingStatus: DocumentStatus.DOCUMENT_PROCESSING_STATUS_PENDING });
            expect((await generate(t, user, { filename, bytes: MB })).status).toBe(403);
            expect(await t.prisma.generationJob.findFirstOrThrow({ where: { userId: user.id } })).toMatchObject({ status: 'FAILED', chargedAmount: 0 });
            t.finance.fund(user.id, 50);

            const retry = await generate(t, user, { filename, bytes: MB });

            expect(retry.status).toBe(201);
            expect(await jobRow(t, retry.body.jobId)).toMatchObject({ chargedAmount: 5, storageId: doc.id });
            expect(t.finance.count('Debit', `gen:${retry.body.jobId}`)).toBe(1);
        });

        it('a reused PROCESSING document with a running job returns that job: no new charge, no new job', async () => {
            const user = await teacher(t, 50);
            const first = await generate(t, user, { filename: `run-${rid()}.pdf`, bytes: MB });
            const job = await jobRow(t, first.body.jobId);
            const filename = job.filename;
            t.document.docs.get(job.storageId)!.processingStatus = DocumentStatus.DOCUMENT_PROCESSING_STATUS_PROCESSING;
            // the first job's lock is still held: free it so the second request reaches the running-job branch
            const redis = t.app.get(RedisService);
            await redis.del(`content:gen:lock:${user.id}:quiz`);

            const second = await generate(t, user, { filename, bytes: MB });

            expect(second.status).toBe(201);
            expect(second.body.jobId).toBe(first.body.jobId);
            expect(t.finance.count('Debit', `gen:${first.body.jobId}`)).toBe(1);
            expect(await t.prisma.generationJob.count({ where: { userId: user.id } })).toBe(1);
        });

        it('insufficient credits: job FAILED, nothing queued, 403 as today, and the new upload is deleted', async () => {
            const user = await teacher(t, 1);
            const res = await generate(t, user, { bytes: MB });

            expect(res.status).toBe(403);
            expect(res.body).toMatchObject({ statusCode: 403, code: 'INSUFFICIENT_CREDITS' });
            const job = await t.prisma.generationJob.findFirstOrThrow({ where: { userId: user.id } });
            expect(job).toMatchObject({ status: 'FAILED', refundedAt: expect.any(Date) });
            expect(await outboxFor(t, 'content.generation.requested', job.id)).toHaveLength(0);
            expect(balance(user.id)).toBe(1);
            expect(t.finance.count('Refund', `gen:${job.id}`)).toBe(0); // a definitive refusal needs no compensation
            expect(t.document.calls.filter((c) => c.rpc === 'DeleteDocuments' && c.ids?.[0] === job.storageId)).toHaveLength(1);
            expect(t.document.docs.has(job.storageId)).toBe(false);

            // the lock was released: the same user can try again once funded
            t.finance.fund(user.id, 50);
            expect((await generate(t, user, { bytes: MB })).status).toBe(201);
        });

        it('insufficient credits on a REUSED document leaves the document alone', async () => {
            const user = await teacher(t, 2);
            const filename = `keep-${rid()}.pdf`;
            const doc = t.document.add(user.id, { filename, size: String(MB), processingStatus: DocumentStatus.DOCUMENT_PROCESSING_STATUS_COMPLETED });

            const res = await generate(t, user, { filename, bytes: MB });

            expect(res.status).toBe(403);
            expect(t.document.calls.filter((c) => c.rpc === 'DeleteDocuments' && c.ids?.includes(doc.id))).toEqual([]);
            expect(t.document.docs.has(doc.id)).toBe(true);
        });

        it('a lost Debit response is retried by the client and still charges exactly once', async () => {
            const user = await teacher(t, 100);
            t.finance.debitFaults.push('apply-then-unavailable');

            const res = await generate(t, user, { bytes: MB });

            expect(res.status).toBe(201);
            expect([...t.finance.debits.keys()].filter((key) => key === `gen:${res.body.jobId}`)).toHaveLength(1);
            expect(balance(user.id)).toBe(100 - 6);
        });

        it('an unknown Debit outcome stays PENDING_CHARGE (403, lock released); the reaper settles it without double money', async () => {
            const user = await teacher(t, 100);
            t.finance.debitFaults.push('internal');

            const res = await generate(t, user, { bytes: MB });

            expect(res.status).toBe(403);
            expect(res.body).toMatchObject({ code: 'CHARGE_UNAVAILABLE' });
            const job = await t.prisma.generationJob.findFirstOrThrow({ where: { userId: user.id } });
            expect(job.status).toBe('PENDING_CHARGE');
            expect(await outboxFor(t, 'content.generation.requested', job.id)).toHaveLength(0);
            // M1: the NEW upload was stored for this request only and nothing was charged: it is discarded
            expect(t.document.calls.filter((c) => c.rpc === 'DeleteDocuments' && c.ids?.[0] === job.storageId)).toHaveLength(1);
            expect(t.document.docs.has(job.storageId)).toBe(false);

            await ageJob(t, job.id, 11);
            await reap(t);

            expect(await jobRow(t, job.id)).toMatchObject({ status: 'CANCELLED', refundedAt: expect.any(Date) });
            expect(balance(user.id)).toBe(100);
        });

        it('an unknown Debit outcome on a REUSED document leaves the document alone', async () => {
            const user = await teacher(t, 100);
            const filename = `keep2-${rid()}.pdf`;
            const doc = t.document.add(user.id, { filename, size: String(MB), processingStatus: DocumentStatus.DOCUMENT_PROCESSING_STATUS_COMPLETED });
            t.finance.debitFaults.push('internal');

            const res = await generate(t, user, { filename, bytes: MB });

            expect(res.status).toBe(403);
            expect(t.document.calls.filter((c) => c.rpc === 'DeleteDocuments' && c.ids?.includes(doc.id))).toEqual([]);
            expect(t.document.docs.has(doc.id)).toBe(true);
        });

        it.each([
            ['permission-denied' as const, 403, 'PERMISSION_DENIED'],
            ['invalid-argument' as const, 400, 'VALIDATION_FAILED'],
        ])('L7: a %s answer from finance is a definitive refusal: job FAILED at once (not parked 10 minutes), no refund needed, upload discarded', async (fault, http, code) => {
            const user = await teacher(t, 100);
            t.finance.debitFaults.push(fault);

            const res = await generate(t, user, { bytes: MB });

            expect(res.status).toBe(http);
            expect(res.body).toMatchObject({ code });
            const job = await t.prisma.generationJob.findFirstOrThrow({ where: { userId: user.id } });
            expect(job).toMatchObject({ status: 'FAILED', chargedAmount: 0, refundedAt: expect.any(Date) });
            expect(t.finance.count('Refund', `gen:${job.id}`)).toBe(0);
            expect(t.document.docs.has(job.storageId)).toBe(false);
            expect((await generate(t, user, { bytes: MB })).status).toBe(201); // lock released
        });

        it('the reaper settling an old job does not free the lock of the newer job the user started since', async () => {
            const user = await teacher(t, 100);
            t.finance.debitFaults.push('internal');
            expect((await generate(t, user, { bytes: MB })).status).toBe(403);
            const stuck = await t.prisma.generationJob.findFirstOrThrow({ where: { userId: user.id } });
            const running = await generate(t, user, { bytes: MB });
            expect(running.status).toBe(201);

            await ageJob(t, stuck.id, 11);
            await reap(t);

            expect((await jobRow(t, stuck.id)).status).toBe('CANCELLED');
            expect((await jobRow(t, running.body.jobId)).status).toBe('QUEUED');
            expect((await generate(t, user, { bytes: MB })).status).toBe(409); // B still owns the lock
        });

        it('a crash between the Debit and the queueing tx: the reaper cancels the job and refunds exactly once', async () => {
            const user = await teacher(t, 100);
            const queue = jest
                .spyOn(t.app.get(GenerationJobService) as unknown as { queue: () => Promise<boolean> }, 'queue')
                .mockRejectedValueOnce(new Error('process crashed'));

            const res = await generate(t, user, { bytes: MB });
            queue.mockRestore();

            expect(res.status).toBe(500);
            const job = await t.prisma.generationJob.findFirstOrThrow({ where: { userId: user.id } });
            expect(job.status).toBe('PENDING_CHARGE');
            expect(t.finance.debits.has(job.chargeKey)).toBe(true);
            expect(balance(user.id)).toBe(94);

            // not yet old enough: untouched
            await reap(t);
            expect((await jobRow(t, job.id)).status).toBe('PENDING_CHARGE');

            await ageJob(t, job.id, 11);
            const first = await reap(t);
            const second = await reap(t);

            expect(first).toMatchObject({ cancelled: expect.any(Number) });
            expect(await jobRow(t, job.id)).toMatchObject({ status: 'CANCELLED', refundedAt: expect.any(Date) });
            expect(refunded(job.chargeKey)).toBe(true);
            expect(t.finance.calls.filter((c) => c.rpc === 'Refund' && c.key === job.chargeKey)).toEqual([
                expect.objectContaining({ caller: 'svc:exam' }),
            ]);
            expect(second.refunded).toBe(0);
            expect(balance(user.id)).toBe(100);
            expect(await outboxFor(t, 'content.generation.requested', job.id)).toHaveLength(0);
        });

        it('a second request of the same type while a job is open is 409; the other type is allowed', async () => {
            const user = await teacher(t, 100);
            expect((await generate(t, user)).status).toBe(201);
            const again = await generate(t, user);
            expect(again.status).toBe(409);
            expect((await generate(t, user, { typeResult: '2' })).status).toBe(201);
        });

        it('validation errors are refused before anything is stored or charged', async () => {
            const user = await teacher(t, 100);
            const tooMany = await generate(t, user, { quantityQuizz: '51' });
            expect(tooMany.status).toBe(400);
            const tooBig = await generate(t, user, { bytes: 6 * MB });
            expect(tooBig.status).toBe(400);
            expect(t.document.calls.filter((c) => c.caller === user.id)).toEqual([]);
            expect(t.finance.calls.filter((c) => c.userId === user.id)).toEqual([]);
        });

        it('quota exceeded in document-service is 403 QUOTA_EXCEEDED and the lock is released', async () => {
            const user = await teacher(t, 100);
            t.document.fault('CreateUpload', 8, 'QUOTA_EXCEEDED');
            const res = await generate(t, user);
            expect(res.status).toBe(403);
            expect(res.body).toMatchObject({ code: 'QUOTA_EXCEEDED' });
            expect(t.finance.calls.filter((c) => c.userId === user.id)).toEqual([]);
            expect((await generate(t, user)).status).toBe(201);
        });
    });

    describe('regenerate', () => {
        it('charges ceil(count / 10) for a new job on an owned document; a foreign document is 404 with no charge', async () => {
            const owner = await teacher(t, 50);
            const other = await teacher(t, 50);
            const doc = t.document.add(owner.id, { filename: 'own.pdf' });

            const res = await call(t.server, 'post', `/ai/regenerate/${doc.id}`, owner.token, { typeResult: 1, quantityQuizz: 25 });
            expect(res.status).toBe(201);
            expect(t.finance.calls.filter((c) => c.rpc === 'Debit' && c.userId === owner.id)).toEqual([
                expect.objectContaining({ key: `gen:${res.body.jobId}`, amount: 3 }),
            ]);
            expect(await jobRow(t, res.body.jobId)).toMatchObject({ status: 'QUEUED', storageId: doc.id, filename: 'own.pdf' });

            const foreign = await call(t.server, 'post', `/ai/regenerate/${doc.id}`, other.token, { typeResult: 1 });
            expect(foreign.status).toBe(404);
            expect(t.finance.calls.filter((c) => c.userId === other.id)).toEqual([]);
        });

        it('a FAILED document is re-queued (OCR retry) and the new job is charged', async () => {
            const user = await teacher(t, 50);
            const doc = t.document.add(user.id, { processingStatus: DocumentStatus.DOCUMENT_PROCESSING_STATUS_FAILED });
            const res = await call(t.server, 'post', `/ai/regenerate/${doc.id}`, user.token, { typeResult: 2, quantityFlashcard: 10 });
            expect(res.status).toBe(201);
            expect(t.document.calls.filter((c) => c.rpc === 'EnsureProcessed' && c.ids?.[0] === doc.id)).toHaveLength(1);
            expect(t.finance.count('Debit', `gen:${res.body.jobId}`)).toBe(1);
        });
    });

    describe('events from ai-service', () => {
        async function queuedJob(type: '1' | '2' = '1') {
            const user = await teacher(t, 100);
            const res = await generate(t, user, { typeResult: type, bytes: MB });
            return { user, jobId: res.body.jobId as string };
        }

        it('completed: the history rows are written, the job is COMPLETED, the result is served and the lock is free', async () => {
            const { user, jobId } = await queuedJob();
            const { storageId } = await jobRow(t, jobId);
            const sent = await ai.publish('ai.generation.completed', { jobId, type: 'quiz', items: { quizzes: quizItems(3), flashcards: [] } });

            const done = await eventually(async () => {
                const job = await jobRow(t, jobId);
                return job.status === 'COMPLETED' ? job : null;
            });
            expect(done.historyId).toBeTruthy();
            const history = await t.prisma.historyGeneratedQuizz.findUniqueOrThrow({ where: { id: done.historyId! } });
            expect(history).toMatchObject({ userId: user.id, userStorageId: storageId });
            expect(history.quizzes).toEqual(quizItems(3));

            const status = await call(t.server, 'get', `/ai/job/${jobId}`, user.token);
            expect(status.body).toMatchObject({
                jobId,
                status: 'completed',
                result: { type: 'quiz', historyId: history.id, fileInfo: { id: storageId } },
            });
            expect(status.body.result.quizzes).toHaveLength(3);
            // the same job id works with the storage id too (old clients)
            expect((await call(t.server, 'get', `/ai/job/${storageId}`, user.token)).body).toMatchObject({ jobId, status: 'completed' });

            // a replay of the very event and a second event for the finished job change nothing
            await ai.publish('ai.generation.completed', { jobId, type: 'quiz', items: { quizzes: quizItems(2), flashcards: [] } });
            await new Promise((resolve) => setTimeout(resolve, 1500));
            expect(await t.prisma.historyGeneratedQuizz.count({ where: { userStorageId: storageId } })).toBe(1);
            expect(sent.id).toBeTruthy();
            expect(t.finance.count('Refund', `gen:${jobId}`)).toBe(0);
            expect((await generate(t, user, { bytes: MB })).status).toBe(201); // lock released
        });

        it('L6: the generation lock is released only after the consumer transaction commits; a rolled-back completion leaves it held', async () => {
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
            const lockKey = `content:gen:lock:${user.id}:quiz`;
            expect(await redis.getClient().exists(lockKey)).toBe(1);

            const write = jest.spyOn(repo, 'createQuizHistory').mockRejectedValueOnce(new Error('db failed mid-transaction'));
            await expect(handler.onCompleted(envelope)).rejects.toThrow('db failed mid-transaction');
            write.mockRestore();

            // rolled back: the job is still in flight and still owns its lock (a second job must be refused)
            expect((await jobRow(t, jobId)).status).toBe('QUEUED');
            expect(await t.prisma.historyGeneratedQuizz.count({ where: { userId: user.id } })).toBe(0);
            expect(await redis.getClient().exists(lockKey)).toBe(1);
            expect((await generate(t, user, { bytes: MB })).status).toBe(409);

            // the redelivery commits, and only then is the lock freed
            await handler.onCompleted(envelope);
            expect((await jobRow(t, jobId)).status).toBe('COMPLETED');
            expect(await redis.getClient().exists(lockKey)).toBe(0);
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

        it('failed: the job is FAILED and the debit is refunded exactly once, even when the event is replayed', async () => {
            const { user, jobId } = await queuedJob();
            expect(balance(user.id)).toBe(94);
            await ai.publish('ai.generation.failed', { jobId, reason: 'MODEL_UNAVAILABLE' });
            await eventually(async () => (await jobRow(t, jobId)).refundedAt);

            expect(await jobRow(t, jobId)).toMatchObject({ status: 'FAILED', error: 'MODEL_UNAVAILABLE' });
            expect(balance(user.id)).toBe(100);
            await ai.publish('ai.generation.failed', { jobId, reason: 'MODEL_UNAVAILABLE' });
            await new Promise((resolve) => setTimeout(resolve, 1500));
            expect(t.finance.count('Refund', `gen:${jobId}`)).toBe(1);
            expect(balance(user.id)).toBe(100);

            const status = await call(t.server, 'get', `/ai/job/${jobId}`, user.token);
            expect(status.body).toMatchObject({ jobId, status: 'failed', error: 'Model hiện tại không khả dụng, thử model khác.' });
            expect((await generate(t, user, { bytes: MB })).status).toBe(201); // lock released
        });

        it('failed while finance is down: the job is FAILED with the refund still open, and the sweeper finishes it', async () => {
            const { user, jobId } = await queuedJob();
            t.finance.refundFaults.push('unavailable', 'unavailable', 'unavailable');
            await ai.publish('ai.generation.failed', { jobId, reason: 'GENERATION_FAILED' });
            await eventually(async () => (await jobRow(t, jobId)).status === 'FAILED');
            await new Promise((resolve) => setTimeout(resolve, 500));

            expect(await jobRow(t, jobId)).toMatchObject({ status: 'FAILED', refundedAt: null });
            expect(balance(user.id)).toBe(94);

            await reap(t); // too fresh for the sweeper: the grace protects an in-flight debit
            expect((await jobRow(t, jobId)).refundedAt).toBeNull();
            await ageJob(t, jobId, 3);
            await reap(t);

            expect((await jobRow(t, jobId)).refundedAt).not.toBeNull();
            expect(balance(user.id)).toBe(100);
            expect(refunded(`gen:${jobId}`)).toBe(true);
        });

        it('an event for an unknown job is ignored', async () => {
            await ai.publish('ai.generation.failed', { jobId: `nope_${rid()}`, reason: 'X' });
            await ai.publish('ai.generation.completed', { jobId: `nope_${rid()}`, type: 'quiz', items: { quizzes: quizItems(1), flashcards: [] } });
            await new Promise((resolve) => setTimeout(resolve, 1000));
            // no throw, nothing to assert beyond the app still serving
            expect((await call(t.server, 'get', '/ai/models', (await teacher(t)).token)).status).toBe(200);
        });
    });

    describe('watchdog (jobs ai-service never answered)', () => {
        async function silentJob(status: 'QUEUED' | 'PROCESSING' = 'QUEUED') {
            const user = await teacher(t, 100);
            const { jobId } = (await generate(t, user, { bytes: MB })).body;
            if (status === 'PROCESSING') await t.prisma.generationJob.update({ where: { id: jobId }, data: { status } });
            return { user, jobId };
        }

        it.each(['QUEUED', 'PROCESSING'] as const)(
            'a %s job silent for more than the timeout is FAILED GENERATION_TIMEOUT with exactly one Refund and a free lock',
            async (status) => {
                const { user, jobId } = await silentJob(status);
                expect(balance(user.id)).toBe(94);

                await ageJob(t, jobId, 61);
                await reap(t);
                await reap(t); // a second pass must not refund again

                expect(await jobRow(t, jobId)).toMatchObject({ status: 'FAILED', error: 'GENERATION_TIMEOUT', refundedAt: expect.any(Date) });
                expect(t.finance.count('Refund', `gen:${jobId}`)).toBe(1);
                expect(t.finance.calls.find((c) => c.rpc === 'Refund' && c.key === `gen:${jobId}`)).toMatchObject({ caller: 'svc:exam' });
                expect(balance(user.id)).toBe(100);
                expect((await call(t.server, 'get', `/ai/job/${jobId}`, user.token)).body).toMatchObject({ status: 'failed' });
                expect((await generate(t, user, { bytes: MB })).status).toBe(201); // lock released
            }
        );

        it('a job younger than the timeout is untouched', async () => {
            const { user, jobId } = await silentJob();
            await ageJob(t, jobId, 59);
            await reap(t);
            expect((await jobRow(t, jobId)).status).toBe('QUEUED');
            expect(t.finance.count('Refund', `gen:${jobId}`)).toBe(0);
            expect(balance(user.id)).toBe(94);
        });

        it('late completed / failed events after the watchdog fired write no history and refund nothing twice', async () => {
            const { user, jobId } = await silentJob();
            const { storageId } = await jobRow(t, jobId);
            await ageJob(t, jobId, 61);
            await reap(t);

            await ai.publish('ai.generation.completed', { jobId, type: 'quiz', items: { quizzes: quizItems(2), flashcards: [] } });
            await ai.publish('ai.generation.failed', { jobId, reason: 'GENERATION_FAILED' });
            await new Promise((resolve) => setTimeout(resolve, 1500));

            expect(await jobRow(t, jobId)).toMatchObject({ status: 'FAILED', error: 'GENERATION_TIMEOUT' });
            expect(await t.prisma.historyGeneratedQuizz.count({ where: { userStorageId: storageId } })).toBe(0);
            expect(t.finance.count('Refund', `gen:${jobId}`)).toBe(1);
            expect(balance(user.id)).toBe(100);
        });
    });

    describe('cancel', () => {
        it('cancelling a QUEUED job refunds once and frees the lock; cancelling again is 200 with no second Refund', async () => {
            const user = await teacher(t, 100);
            const { body } = await generate(t, user, { bytes: MB });

            const first = await call(t.server, 'delete', `/ai/job/${body.jobId}`, user.token);
            expect(first.status).toBe(200);
            expect(first.body).toMatchObject({ success: true });
            expect(await jobRow(t, body.jobId)).toMatchObject({ status: 'CANCELLED', refundedAt: expect.any(Date) });
            expect(balance(user.id)).toBe(100);

            const second = await call(t.server, 'delete', `/ai/job/${body.jobId}`, user.token);
            expect(second.status).toBe(200);
            expect(t.finance.count('Refund', `gen:${body.jobId}`)).toBe(1);
            expect(balance(user.id)).toBe(100);
            expect((await call(t.server, 'get', `/ai/job/${body.jobId}`, user.token)).body).toMatchObject({ status: 'failed' });
            expect((await generate(t, user, { bytes: MB })).status).toBe(201);
        });

        it('cancelling a COMPLETED or FAILED job is 409 JOB_NOT_CANCELLABLE and moves no money', async () => {
            const user = await teacher(t, 100);
            const done = (await generate(t, user, { bytes: MB })).body.jobId as string;
            await ai.publish('ai.generation.completed', { jobId: done, type: 'quiz', items: { quizzes: quizItems(2), flashcards: [] } });
            await eventually(async () => (await jobRow(t, done)).status === 'COMPLETED');
            const failed = (await generate(t, user, { bytes: MB })).body.jobId as string;
            await ai.publish('ai.generation.failed', { jobId: failed, reason: 'GENERATION_FAILED' });
            await eventually(async () => (await jobRow(t, failed)).status === 'FAILED');
            const refundsBefore = t.finance.count('Refund');

            for (const id of [done, failed]) {
                const res = await call(t.server, 'delete', `/ai/job/${id}`, user.token);
                expect(res.status).toBe(409);
                expect(res.body).toMatchObject({ code: 'JOB_NOT_CANCELLABLE' });
            }
            expect(t.finance.count('Refund')).toBe(refundsBefore);
        });

        it('a result that arrives after the cancel writes no history and the refund stays single', async () => {
            const user = await teacher(t, 100);
            const { jobId } = (await generate(t, user, { bytes: MB })).body;
            const { storageId } = await jobRow(t, jobId);
            await call(t.server, 'delete', `/ai/job/${jobId}`, user.token);

            await ai.publish('ai.generation.completed', { jobId, type: 'quiz', items: { quizzes: quizItems(2), flashcards: [] } });
            await new Promise((resolve) => setTimeout(resolve, 1500));

            expect((await jobRow(t, jobId)).status).toBe('CANCELLED');
            expect(await t.prisma.historyGeneratedQuizz.count({ where: { userStorageId: storageId } })).toBe(0);
            expect(t.finance.count('Refund', `gen:${jobId}`)).toBe(1);
            expect(balance(user.id)).toBe(100);
        });

        it('cancel while the job is still PENDING_CHARGE: step (3) updates 0 rows, so the request refunds and answers 409 JOB_CANCELLED', async () => {
            const user = await teacher(t, 100);
            const charge = t.app.get(GenerationChargeService);
            const original = charge.debit.bind(charge);
            let release!: () => void;
            const gate = new Promise<void>((resolve) => (release = resolve));
            const spy = jest.spyOn(charge, 'debit').mockImplementation(async (...args) => {
                await gate; // the request sits between (1) and (2) while the user cancels
                return original(...args);
            });
            try {
                const pending = generate(t, user, { bytes: MB }).then((res) => res);
                const job = await eventually(() => t.prisma.generationJob.findFirst({ where: { userId: user.id } }));
                expect(job.status).toBe('PENDING_CHARGE');

                const cancel = await call(t.server, 'delete', `/ai/job/${job.id}`, user.token);
                expect(cancel.status).toBe(200);
                expect((await jobRow(t, job.id)).status).toBe('CANCELLED');
                expect(balance(user.id)).toBe(100); // nothing was debited yet

                release();
                const res = await pending;

                expect(res.status).toBe(409);
                expect(res.body).toMatchObject({ code: 'JOB_CANCELLED' });
                expect(t.finance.debits.has(job.chargeKey)).toBe(true); // the late debit landed...
                expect(refunded(job.chargeKey)).toBe(true); // ...and was refunded by the request itself
                expect(balance(user.id)).toBe(100);
                expect((await jobRow(t, job.id)).refundedAt).not.toBeNull();
                expect(await outboxFor(t, 'content.generation.requested', job.id)).toHaveLength(0);
            } finally {
                release();
                spy.mockRestore();
            }
        });

        it('another user cannot cancel or read the job (404)', async () => {
            const owner = await teacher(t, 100);
            const other = await teacher(t, 100);
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

    it('every document-service call exam made carried a user token (a service token would have been refused)', () => {
        expect(t.document.calls.length).toBeGreaterThan(0);
        expect(t.document.calls.filter((c) => c.caller.startsWith('svc:'))).toEqual([]);
        // the refund is the only finance call made as a service
        expect(new Set(t.finance.calls.filter((c) => c.caller.startsWith('svc:')).map((c) => c.rpc))).toEqual(new Set(['Refund']));
    });
});
