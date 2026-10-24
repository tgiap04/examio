import { RedisService } from '@examio/redis';
import { call, bootExamApp, teacher, type ExamTestApp } from './support';

describe('examattempt history stats and the model catalog (e2e)', () => {
    let t: ExamTestApp;

    beforeAll(async () => {
        t = await bootExamApp();
    });
    afterAll(() => t?.close());

    describe('GET /examattempts/history-stats', () => {
        it('totalPDFs is GetQuota().fileCount, read as the caller; the result is cached so a second call asks document-service nothing', async () => {
            const student = await t.createUser(['STUDENT']); // GetQuota is open to any verified user
            const token = await t.tokenFor(student);
            t.document.quotaFileCount.set(student.id, 7);
            const since = t.document.calls.length;

            const first = await call(t.server, 'get', '/examattempts/history-stats', token);
            const second = await call(t.server, 'get', '/examattempts/history-stats', token);

            expect(first.status).toBe(200);
            expect(first.body).toMatchObject({ totalPDFs: 7, examsCreated: 0, flashcardSets: 0, totalStudyHours: 0 });
            expect(second.body).toEqual(first.body);
            const quota = t.document.calls.slice(since).filter((c) => c.rpc === 'GetQuota');
            expect(quota).toEqual([expect.objectContaining({ caller: student.id })]);
        });

        it('without document-service the dashboard still loads (0 files) and the incomplete result is not cached', async () => {
            const student = await t.createUser(['STUDENT']);
            const token = await t.tokenFor(student);
            t.document.quotaFileCount.set(student.id, 3);
            for (let i = 0; i < 3; i++) t.document.fault('GetQuota', 14, 'down'); // retried on UNAVAILABLE

            const degraded = await call(t.server, 'get', '/examattempts/history-stats', token);
            expect(degraded.status).toBe(200);
            expect(degraded.body).toMatchObject({ totalPDFs: 0 });

            const recovered = await call(t.server, 'get', '/examattempts/history-stats', token);
            expect(recovered.body).toMatchObject({ totalPDFs: 3 });
        });
    });

    describe('GET /ai/models', () => {
        it('lists ai-service models as svc:exam and caches them for 10 minutes', async () => {
            const user = await teacher(t);
            const redis = t.app.get(RedisService);
            await redis.del('exam:ai:models');
            const before = t.ai.callers.length;

            const first = await call(t.server, 'get', '/ai/models', user.token);
            const second = await call(t.server, 'get', '/ai/models', user.token);

            expect(first.status).toBe(200);
            expect(first.body).toMatchObject({
                defaultGenerationModel: 'gen-a',
                embeddingModel: { id: 'embed-1', available: true },
            });
            expect(first.body.generationModels.map((m: { id: string }) => m.id)).toEqual(['gen-a', 'gen-b']);
            expect(first.body.generationModels[0]).toMatchObject({ isDefault: true, specs: [{ label: 'Provider', value: 'test' }] });
            expect(first.body.generationModels[0]).not.toHaveProperty('availabilityReason');
            expect(second.body).toEqual(first.body);
            expect(t.ai.callers.slice(before)).toEqual(['svc:exam']);
            expect(await redis.get('exam:ai:models')).not.toBeNull();
        });

        it('while ai-service is down the catalog falls back to disabled placeholders and is not cached', async () => {
            const user = await teacher(t);
            const redis = t.app.get(RedisService);
            await redis.del('exam:ai:models');
            t.ai.down.value = true;
            try {
                // UNAVAILABLE is retried (idempotent), the fake stays down for every attempt
                const res = await call(t.server, 'get', '/ai/models', user.token);
                expect(res.status).toBe(200);
                expect(res.body.generationModels.every((m: { available: boolean; disabled: boolean }) => !m.available && m.disabled)).toBe(true);
                expect(res.body.embeddingModel).toMatchObject({ id: 'gemini_embedding', disabled: true });
                expect(await redis.get('exam:ai:models')).toBeNull();
            } finally {
                t.ai.down.value = false;
            }
        });
    });
});
