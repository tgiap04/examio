import { HttpException } from '@nestjs/common';
import type Redis from 'ioredis';
import {
    WORD_FAMILY_DAILY_LIMIT,
    consumeDailyGeneration,
    dailyGenerationKey,
} from './word-family-generation-limit';

/** Minimal in-memory `multi().incr().expire(NX)` used by the limiter. */
class FakeRedis {
    counts = new Map<string, number>();
    ttls = new Map<string, number>();
    broken = false;
    multi() {
        const ops: Array<() => number> = [];
        const chain = {
            incr: (key: string) => {
                ops.push(() => {
                    const n = (this.counts.get(key) ?? 0) + 1;
                    this.counts.set(key, n);
                    return n;
                });
                return chain;
            },
            expire: (key: string, seconds: number) => {
                ops.push(() => {
                    if (!this.ttls.has(key)) this.ttls.set(key, seconds);
                    return 1;
                });
                return chain;
            },
            exec: async () => {
                if (this.broken) throw new Error('redis down');
                return ops.map((op) => [null, op()] as [null, number]);
            },
        };
        return chain;
    }
}

describe('consumeDailyGeneration', () => {
    const day = new Date('2026-10-20T10:00:00Z');
    let redis: FakeRedis;
    const run = (userId = 'u1', at = day) =>
        consumeDailyGeneration(redis as unknown as Redis, userId, at);

    beforeEach(() => {
        redis = new FakeRedis();
    });

    it('allows 20 generations a day and refuses the 21st with 429', async () => {
        expect(WORD_FAMILY_DAILY_LIMIT).toBe(20);
        for (let i = 0; i < 20; i++) await run();
        await expect(run()).rejects.toMatchObject({ status: 429 });
        try {
            await run();
        } catch (e) {
            expect((e as HttpException).getResponse()).toMatchObject({
                code: 'WORD_FAMILY_DAILY_LIMIT',
            });
        }
    });

    it('counts per user and per UTC day', async () => {
        for (let i = 0; i < 20; i++) await run('u1');
        await expect(run('u2')).resolves.toBeUndefined();
        await expect(
            run('u1', new Date('2026-10-21T00:00:01Z'))
        ).resolves.toBeUndefined();
        expect(dailyGenerationKey('u1', day)).toBe(
            'wf:gen:daily:u1:2026-10-20'
        );
    });

    it('expires the counter after the day (first hit only)', async () => {
        await run();
        expect(redis.ttls.get(dailyGenerationKey('u1', day))).toBe(90_000);
    });

    it('fails closed (503) when Redis errors', async () => {
        redis.broken = true;
        await expect(run()).rejects.toMatchObject({ status: 503 });
    });
});
