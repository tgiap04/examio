import { RateLimiterService, type RateLimitStore } from './rate-limiter.service';

function memoryStore(): RateLimitStore & { keys: string[] } {
    const counts = new Map<string, number>();
    const keys: string[] = [];
    return {
        keys,
        async hit(key, windowMs) {
            keys.push(key);
            const count = (counts.get(key) ?? 0) + 1;
            counts.set(key, count);
            return { count, ttlMs: windowMs };
        },
    };
}

const DEFAULT = { id: 'default', max: 100, windowMs: 60_000 };
const LOGIN = { id: 'auth-login', max: 5, windowMs: 60_000 };

describe('RateLimiterService', () => {
    it('allows 100 and blocks the 101st with a Retry-After inside the window', async () => {
        const svc = new RateLimiterService(memoryStore());
        for (let i = 0; i < 100; i++) {
            expect((await svc.check(DEFAULT, '1.2.3.4')).allowed).toBe(true);
        }
        const blocked = await svc.check(DEFAULT, '1.2.3.4');
        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
        expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
    });

    it('auth-login: the 6th attempt is blocked', async () => {
        const svc = new RateLimiterService(memoryStore());
        const results: boolean[] = [];
        for (let i = 0; i < 6; i++) results.push((await svc.check(LOGIN, '1.2.3.4')).allowed);
        expect(results).toEqual([true, true, true, true, true, false]);
    });

    it('buckets are independent per subject and per limit id', async () => {
        const svc = new RateLimiterService(memoryStore());
        for (let i = 0; i < 5; i++) await svc.check(LOGIN, 'a');
        expect((await svc.check(LOGIN, 'a')).allowed).toBe(false);
        expect((await svc.check(LOGIN, 'b')).allowed).toBe(true);
        expect((await svc.check({ ...LOGIN, id: 'auth-register' }, 'a')).allowed).toBe(true);
    });

    it('keys are gw:rl:<id>:<subject>:<windowStart> and roll over with the window', async () => {
        const store = memoryStore();
        let now = 120_000;
        const svc = new RateLimiterService(store, { now: () => now });
        await svc.check(LOGIN, 'u1');
        now = 180_001;
        await svc.check(LOGIN, 'u1');
        expect(store.keys).toEqual(['gw:rl:auth-login:u1:120000', 'gw:rl:auth-login:u1:180000']);
    });

    it('fails open when the store errors, and counts it', async () => {
        const svc = new RateLimiterService({
            hit: () => Promise.reject(new Error('Connection is closed.')),
        });
        await expect(svc.check(LOGIN, 'x')).resolves.toEqual({ allowed: true, retryAfterSec: 0 });
        expect(svc.failedOpen).toBe(1);
    });
});
