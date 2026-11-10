import type Redis from 'ioredis';
import { HttpException } from '@nestjs/common';
import {
    CODE_FAIL_LIMIT,
    CODE_FAIL_WINDOW_SECONDS,
    codeFailKey,
    generateAccessCode,
    verifyAccessCodeOrThrow,
} from './access-code-guard';

/** In-memory stand-in for the four ioredis calls the guard uses (TTL honoured via a fake clock). */
class FakeRedis {
    now = 0;
    broken = false;
    private data = new Map<string, { value: number; expiresAt?: number }>();

    private live(key: string) {
        const e = this.data.get(key);
        if (e?.expiresAt !== undefined && e.expiresAt <= this.now) {
            this.data.delete(key);
            return undefined;
        }
        return e;
    }
    private guard() {
        if (this.broken) throw new Error('redis down');
    }
    async get(key: string) {
        this.guard();
        const e = this.live(key);
        return e ? String(e.value) : null;
    }
    async ttl(key: string) {
        this.guard();
        const e = this.live(key);
        if (!e) return -2;
        return e.expiresAt === undefined
            ? -1
            : Math.ceil((e.expiresAt - this.now) / 1000);
    }
    async del(key: string) {
        this.guard();
        this.data.delete(key);
    }
    multi() {
        const ops: Array<() => unknown> = [];
        const chain = {
            incr: (key: string) => {
                ops.push(() => {
                    const e = this.live(key) ?? { value: 0 };
                    e.value += 1;
                    this.data.set(key, e);
                    return e.value;
                });
                return chain;
            },
            expire: (key: string, seconds: number, mode: string) => {
                ops.push(() => {
                    const e = this.live(key)!;
                    if (mode === 'NX' && e.expiresAt !== undefined) return 0;
                    e.expiresAt = this.now + seconds * 1000;
                    return 1;
                });
                return chain;
            },
            ttl: (key: string) => {
                ops.push(() => {
                    const e = this.live(key)!;
                    return Math.ceil(
                        ((e.expiresAt ?? this.now) - this.now) / 1000
                    );
                });
                return chain;
            },
            exec: async () => {
                this.guard();
                return ops.map((op) => [null, op()] as [null, unknown]);
            },
        };
        return chain;
    }
}

describe('verifyAccessCodeOrThrow', () => {
    let redis: FakeRedis;
    const base = { resourceId: 'set-1', userId: 'userA', stored: '123456' };
    const run = (
        over: Partial<{
            userId: string;
            given: unknown;
            stored: string | null;
        }> = {}
    ) =>
        verifyAccessCodeOrThrow(redis as unknown as Redis, {
            ...base,
            given: '123456',
            ...over,
        });
    const outcome = async (p: Promise<unknown>) => {
        try {
            await p;
            return 'ok';
        } catch (e) {
            const x = e as HttpException;
            const body = x.getResponse() as {
                code: string;
                retryAfterSeconds?: number;
            };
            return `${x.getStatus()} ${body.code}`;
        }
    };

    beforeEach(() => {
        redis = new FakeRedis();
    });

    it('uses the documented limits and key shape', () => {
        expect(CODE_FAIL_LIMIT).toBe(5);
        expect(CODE_FAIL_WINDOW_SECONDS).toBe(900);
        expect(codeFailKey('r', 'u')).toBe('assessment:codefail:r:u');
    });

    it('accepts the right code and clears the failure counter', async () => {
        await outcome(run({ given: '000000' }));
        await outcome(run({ given: '000001' }));
        expect(await redis.get(codeFailKey('set-1', 'userA'))).toBe('2');
        expect(await outcome(run())).toBe('ok');
        expect(await redis.get(codeFailKey('set-1', 'userA'))).toBeNull();
    });

    it('answers 400 INVALID_CODE for a wrong code and counts it', async () => {
        expect(await outcome(run({ given: '654321' }))).toBe(
            '400 INVALID_CODE'
        );
        expect(await redis.get(codeFailKey('set-1', 'userA'))).toBe('1');
    });

    it('sets the 15 minute expiry on the first failure only', async () => {
        await outcome(run({ given: '000000' }));
        expect(await redis.ttl(codeFailKey('set-1', 'userA'))).toBe(900);
        redis.now += 300_000;
        await outcome(run({ given: '000001' }));
        expect(await redis.ttl(codeFailKey('set-1', 'userA'))).toBe(600);
    });

    it('locks on the 5th wrong code with 429 CODE_LOCKED and retryAfterSeconds', async () => {
        for (let i = 0; i < 4; i++) {
            expect(await outcome(run({ given: `00000${i}` }))).toBe(
                '400 INVALID_CODE'
            );
        }
        expect(await outcome(run({ given: '000009' }))).toBe('429 CODE_LOCKED');
        try {
            await run();
        } catch (e) {
            const body = (e as HttpException).getResponse() as {
                retryAfterSeconds: number;
            };
            expect(body.retryAfterSeconds).toBeGreaterThan(0);
            expect(body.retryAfterSeconds).toBeLessThanOrEqual(900);
        }
    });

    it('refuses even the correct code while locked', async () => {
        for (let i = 0; i < 5; i++) await outcome(run({ given: `00000${i}` }));
        expect(await outcome(run())).toBe('429 CODE_LOCKED');
    });

    it('unlocks after the window expires', async () => {
        for (let i = 0; i < 5; i++) await outcome(run({ given: `00000${i}` }));
        redis.now += 901_000;
        expect(await outcome(run())).toBe('ok');
    });

    it('rejects a malformed code with 400 and does not count it', async () => {
        for (const given of [
            '12345',
            '1234567',
            'abcdef',
            '12 456',
            '',
            undefined,
            123456,
            null,
            {},
        ]) {
            expect(await outcome(run({ given }))).toBe(
                '400 INVALID_CODE_FORMAT'
            );
        }
        expect(await redis.get(codeFailKey('set-1', 'userA'))).toBeNull();
    });

    it('does not accept any code when the resource has none stored', async () => {
        expect(await outcome(run({ stored: null }))).toBe('400 INVALID_CODE');
        expect(await outcome(run({ stored: '' }))).toBe('400 INVALID_CODE');
    });

    it('does not lock user B for user A failures (key is per resource and user)', async () => {
        for (let i = 0; i < 5; i++) await outcome(run({ given: `00000${i}` }));
        expect(await outcome(run({ userId: 'userB' }))).toBe('ok');
    });

    it('fails closed with 503 CODE_CHECK_UNAVAILABLE when Redis errors', async () => {
        redis.broken = true;
        expect(await outcome(run())).toBe('503 CODE_CHECK_UNAVAILABLE');
        expect(await outcome(run({ given: '000000' }))).toBe(
            '503 CODE_CHECK_UNAVAILABLE'
        );
    });

    it('compares in constant time (timingSafeEqual over fixed-length digests)', async () => {
        const crypto = await import('crypto');
        const spy = jest.spyOn(crypto, 'timingSafeEqual');
        await run();
        expect(spy).toHaveBeenCalledTimes(1);
        const [a, b] = spy.mock.calls[0] as [Buffer, Buffer];
        expect(a.length).toBe(32);
        expect(b.length).toBe(32);
        spy.mockRestore();
    });

    it('10 parallel wrong guesses: at most 5 are evaluated, the rest are 429 (no read-compare-increment race)', async () => {
        const crypto = await import('crypto');
        const spy = jest.spyOn(crypto, 'timingSafeEqual');
        const results = await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
                outcome(run({ given: `00000${i}` }))
            )
        );
        expect(spy.mock.calls.length).toBeLessThanOrEqual(5);
        expect(
            results.filter((r) => r === '429 CODE_LOCKED').length
        ).toBeGreaterThanOrEqual(5);
        expect(
            results.filter((r) => r === '400 INVALID_CODE').length
        ).toBeLessThanOrEqual(4);
        spy.mockRestore();
    });

    it('parallel guesses cannot sneak the right code past a lock', async () => {
        const results = await Promise.all([
            ...Array.from({ length: 8 }, (_, i) =>
                outcome(run({ given: `00000${i}` }))
            ),
            outcome(run()),
        ]);
        // only the first 5 attempts (by arrival) may be evaluated; the right code at position 9 is refused
        expect(results[8]).toBe('429 CODE_LOCKED');
    });
});

describe('generateAccessCode', () => {
    it('is always 6 digits (leading zeros kept) and varies', () => {
        const seen = new Set<string>();
        for (let i = 0; i < 200; i++) {
            const code = generateAccessCode();
            expect(code).toMatch(/^\d{6}$/);
            seen.add(code);
        }
        expect(seen.size).toBeGreaterThan(150);
    });
});
