import { RedisService } from '@examio/redis';
import { call, bootContentApp, teacher, type ContentTestApp } from './support';

describe('the AI model catalog (e2e)', () => {
    let t: ContentTestApp;

    beforeAll(async () => {
        t = await bootContentApp();
    });
    afterAll(() => t?.close());

    describe('GET /ai/models', () => {
        it('lists ai-service models as svc:content and caches them for 10 minutes', async () => {
            const user = await teacher(t);
            const redis = t.app.get(RedisService);
            await redis.del('content:ai:models');
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
            expect(t.ai.callers.slice(before)).toEqual(['svc:content']);
            expect(await redis.get('content:ai:models')).not.toBeNull();
        });

        it('while ai-service is down the catalog falls back to disabled placeholders and is not cached', async () => {
            const user = await teacher(t);
            const redis = t.app.get(RedisService);
            await redis.del('content:ai:models');
            t.ai.down.value = true;
            try {
                // UNAVAILABLE is retried (idempotent), the fake stays down for every attempt
                const res = await call(t.server, 'get', '/ai/models', user.token);
                expect(res.status).toBe(200);
                expect(res.body.generationModels.every((m: { available: boolean; disabled: boolean }) => !m.available && m.disabled)).toBe(true);
                expect(res.body.embeddingModel).toMatchObject({ id: 'gemini_embedding', disabled: true });
                expect(await redis.get('content:ai:models')).toBeNull();
            } finally {
                t.ai.down.value = false;
            }
        });
    });
});
