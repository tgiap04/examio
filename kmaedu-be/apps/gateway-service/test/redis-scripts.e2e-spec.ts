import 'reflect-metadata';
import { RedisService } from '@kmaedu/redis';
import { AuthStateService } from '../src/pipeline/auth-state.service';
import { GatewayRedis } from '../src/pipeline/gateway-redis';
import { RateLimiterService } from '../src/pipeline/rate-limiter.service';

const RUN = Math.random().toString(36).slice(2, 8);

/** The two Lua scripts against a real Redis (REDIS_HOST/PORT). */
describe('gateway Lua scripts (real Redis)', () => {
    let redis: RedisService;
    let gw: GatewayRedis;

    beforeAll(async () => {
        redis = new RedisService();
        redis.onModuleInit();
        for (let i = 0; i < 50 && redis.getClient().status !== 'ready'; i++) {
            await new Promise((r) => setTimeout(r, 100));
        }
        gw = new GatewayRedis(redis);
    });
    afterAll(() => redis.onModuleDestroy());

    describe('set-max.lua', () => {
        const get = (key: string) => redis.getClient().get(key);
        const ttl = (key: string) => redis.getClient().ttl(key);

        it('5 then 4 keeps 5', async () => {
            const key = `gw:test:setmax-a-${RUN}`;
            await gw.setMax(key, 5);
            await gw.setMax(key, 4);
            expect(await get(key)).toBe('5');
        });

        it('4 then 5 stores 5', async () => {
            const key = `gw:test:setmax-b-${RUN}`;
            await gw.setMax(key, 4);
            await gw.setMax(key, 5);
            expect(await get(key)).toBe('5');
        });

        it('expires within 960 s (token TTL + skew) and is idempotent', async () => {
            const key = `gw:test:setmax-c-${RUN}`;
            await gw.setMax(key, 7);
            await gw.setMax(key, 7);
            const remaining = await ttl(key);
            expect(remaining).toBeGreaterThan(900);
            expect(remaining).toBeLessThanOrEqual(960);
        });

        it('overwrites a corrupt stored value instead of erroring', async () => {
            const key = `gw:test:setmax-d-${RUN}`;
            await redis.getClient().set(key, 'not-a-number');
            await gw.setMax(key, 3);
            expect(await get(key)).toBe('3');
        });
    });

    describe('rate-limit.lua', () => {
        it('counts atomically, expires the bucket, and the limiter blocks past max', async () => {
            const limiter = new RateLimiterService(gw);
            const limit = { id: `e2e-${RUN}`, max: 3, windowMs: 5_000 };
            const outcomes = await Promise.all(
                Array.from({ length: 6 }, () => limiter.check(limit, 'subject'))
            );
            expect(outcomes.filter((o) => o.allowed)).toHaveLength(3);
            const blocked = outcomes.find((o) => !o.allowed)!;
            expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
            expect(blocked.retryAfterSec).toBeLessThanOrEqual(5);
            const keys = await redis.getClient().keys(`gw:rl:e2e-${RUN}:subject:*`);
            expect(keys).toHaveLength(1);
            expect(await redis.getClient().pttl(keys[0])).toBeGreaterThan(0);
        });
    });

    describe('AuthStateService on real keys', () => {
        it('revoke + av round trip through MGET', async () => {
            const svc = new AuthStateService(gw);
            const user = { id: `u-${RUN}`, sid: `s-${RUN}`, av: 1 };
            const req = { method: 'GET', pathname: '/api/v1/x' };
            expect(await svc.check(user, req)).toBe('ok');
            await svc.raiseAuthzVersion(user.id, 2);
            expect(await svc.check(user, req)).toBe('stale');
            await svc.revokeSession(user.sid, Math.floor(Date.now() / 1000) + 30);
            expect(await svc.check({ ...user, av: 2 }, req)).toBe('revoked');
            const ttl = await redis.getClient().ttl(`gw:revoked:sid:${user.sid}`);
            expect(ttl).toBeGreaterThan(0);
            expect(ttl).toBeLessThanOrEqual(30);
        });
    });
});
