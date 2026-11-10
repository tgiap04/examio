import { ClientGrpc } from '@nestjs/microservices';
import { Metadata, status } from '@grpc/grpc-js';
import { defer, of, throwError } from 'rxjs';
import { buildMetadata } from '../metadata';
import {
    PROFILE_BATCH_SIZE,
    PROFILE_CACHE_TTL_SECONDS,
    PublicProfileClient,
    profileCacheKey as cacheKey,
    profileTombstoneKey as tombKey,
} from './public-profile.client';

const PREFIX = 'svc:cache:user:';
const profileCacheKey = (id: string) => cacheKey(PREFIX, id);
const profileTombstoneKey = (id: string) => tombKey(PREFIX, id);

const profile = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    username: `u${id}`,
    name: `Name ${id}`,
    avatar: '',
    ...extra,
});
const grpcError = (code: number, details = 'x') =>
    Object.assign(new Error(`${code} ${details}`), { code, details });

function setup(opts: { cached?: Record<string, string>; redisDown?: boolean } = {}) {
    const store = new Map<string, string>(Object.entries(opts.cached ?? {}));
    const redisClient = {
        mget: jest.fn(async (...keys: string[]) => {
            if (opts.redisDown) throw new Error('redis down');
            return keys.map((k) => store.get(k) ?? null);
        }),
        pipeline: jest.fn(() => {
            const ops: Array<() => unknown> = [];
            const p = {
                set: jest.fn((k: string, v: string, _ex: string, _ttl: number) => {
                    ops.push(() => store.set(k, v) && 'OK');
                    return p;
                }),
                // Emulates the Lua guard: SET key EX ttl only when the tombstone is absent.
                eval: jest.fn(
                    (_script: string, _n: number, key: string, tomb: string, v: string, _ttl: number) => {
                        ops.push(() => (store.has(tomb) ? 0 : (store.set(key, v), 1)));
                        return p;
                    }
                ),
                exists: jest.fn((k: string) => {
                    ops.push(() => (store.has(k) ? 1 : 0));
                    return p;
                }),
                exec: jest.fn(async () => {
                    if (opts.redisDown) throw new Error('redis down');
                    return ops.map((o) => [null, o()]);
                }),
            };
            return p;
        }),
        set: jest.fn(async (k: string, v: string, ..._rest: unknown[]) => {
            store.set(k, v);
            return 'OK';
        }),
        del: jest.fn(async (k: string) => {
            store.delete(k);
            return 1;
        }),
    };
    const auth = {
        getPublicProfilesByIds: jest.fn((req: { userIds: string[] }, ..._rest: unknown[]) =>
            of({ profiles: req.userIds.filter((i) => !i.startsWith('gone')).map((i) => profile(i)) })
        ),
    };
    const serviceMetadata = { attach: jest.fn(async (md: Metadata, _aud: string) => md) };
    const client = new PublicProfileClient(
        { getService: () => auth } as unknown as ClientGrpc,
        { getClient: () => redisClient } as never,
        serviceMetadata as never,
        PREFIX
    );
    client.onModuleInit();
    return { client, auth, redisClient, store, serviceMetadata };
}

describe('PublicProfileClient.getPublicProfiles', () => {
    it('N ids, nothing cached: exactly ONE RPC, order kept', async () => {
        const { client, auth } = setup();
        const out = await client.getPublicProfiles(['3', '1', '2']);
        expect(auth.getPublicProfilesByIds).toHaveBeenCalledTimes(1);
        expect(auth.getPublicProfilesByIds.mock.calls[0][0]).toEqual({ userIds: ['3', '1', '2'] });
        expect(out.map((p) => p?.id)).toEqual(['3', '1', '2']);
    });

    it('all cached: ZERO RPCs', async () => {
        const { client, auth } = setup({
            cached: {
                [profileCacheKey('1')]: JSON.stringify(profile('1')),
                [profileCacheKey('2')]: JSON.stringify(profile('2')),
            },
        });
        const out = await client.getPublicProfiles(['2', '1']);
        expect(auth.getPublicProfilesByIds).not.toHaveBeenCalled();
        expect(out.map((p) => p?.id)).toEqual(['2', '1']);
    });

    it('partial hit: one RPC for only the misses; result keeps input order; misses are cached with TTL 600', async () => {
        const { client, auth, store, redisClient } = setup({
            cached: { [profileCacheKey('1')]: JSON.stringify(profile('1')) },
        });
        const out = await client.getPublicProfiles(['2', '1', '3']);
        expect(auth.getPublicProfilesByIds.mock.calls[0][0]).toEqual({ userIds: ['2', '3'] });
        expect(out.map((p) => p?.id)).toEqual(['2', '1', '3']);
        expect(store.has(profileCacheKey('2'))).toBe(true);
        expect(store.has(profileCacheKey('3'))).toBe(true);
        const evalCall = redisClient.pipeline.mock.results[0].value.eval.mock.calls[0];
        expect(evalCall.slice(1)).toEqual([
            2,
            profileCacheKey('2'),
            profileTombstoneKey('2'),
            JSON.stringify(profile('2', { avatar: null })),
            PROFILE_CACHE_TTL_SECONDS,
        ]);
        expect(PROFILE_CACHE_TTL_SECONDS).toBe(600);
    });

    it('unknown id yields null in place and never throws', async () => {
        const { client } = setup();
        const out = await client.getPublicProfiles(['1', 'gone-1', '2']);
        expect(out.map((p) => p?.id ?? null)).toEqual(['1', null, '2']);
    });

    it('duplicates are looked up once and still answered in place; blanks are null', async () => {
        const { client, auth } = setup();
        const out = await client.getPublicProfiles(['1', '1', '', '2']);
        expect(auth.getPublicProfilesByIds.mock.calls[0][0]).toEqual({ userIds: ['1', '2'] });
        expect(out.map((p) => p?.id ?? null)).toEqual(['1', '1', null, '2']);
    });

    it('empty input makes no cache read and no RPC', async () => {
        const { client, auth, redisClient } = setup();
        await expect(client.getPublicProfiles([])).resolves.toEqual([]);
        expect(redisClient.mget).not.toHaveBeenCalled();
        expect(auth.getPublicProfilesByIds).not.toHaveBeenCalled();
    });

    it('caches and returns the PUBLIC projection only, whatever the server sends', async () => {
        const { client, auth, store } = setup();
        auth.getPublicProfilesByIds.mockReturnValueOnce(
            of({ profiles: [profile('1', { email: 'a@b.test', isBanned: true })] })
        );
        const [p] = await client.getPublicProfiles(['1']);
        expect(Object.keys(p!).sort()).toEqual(['avatar', 'id', 'name', 'username']);
        expect(store.get(profileCacheKey('1'))).not.toMatch(/email|isBanned/);
    });

    it('a poisoned cache entry is treated as a miss', async () => {
        const { client, auth } = setup({ cached: { [profileCacheKey('1')]: '{not json' } });
        const out = await client.getPublicProfiles(['1']);
        expect(auth.getPublicProfilesByIds).toHaveBeenCalledTimes(1);
        expect(out[0]?.id).toBe('1');
    });

    it('UNAVAILABLE degrades to null placeholders (cached ones still served)', async () => {
        const { client, auth } = setup({
            cached: { [profileCacheKey('1')]: JSON.stringify(profile('1')) },
        });
        auth.getPublicProfilesByIds.mockReturnValue(throwError(() => grpcError(status.UNAVAILABLE)));
        const out = await client.getPublicProfiles(['1', '2']);
        expect(out.map((p) => p?.id ?? null)).toEqual(['1', null]);
    });

    it('strict mode turns UNAVAILABLE into a 503 instead of silent nulls', async () => {
        const { client, auth } = setup();
        auth.getPublicProfilesByIds.mockReturnValue(throwError(() => grpcError(status.UNAVAILABLE)));
        await expect(
            client.getPublicProfiles(['1'], buildMetadata(), { strict: true })
        ).rejects.toMatchObject({ status: 503 });
    });

    it('other gRPC errors are not swallowed', async () => {
        const { client, auth } = setup();
        auth.getPublicProfilesByIds.mockReturnValue(
            throwError(() => grpcError(status.PERMISSION_DENIED))
        );
        await expect(client.getPublicProfiles(['1'])).rejects.toMatchObject({
            code: status.PERMISSION_DENIED,
        });
    });

    it('a Redis outage falls through to the RPC instead of failing the request', async () => {
        const { client, auth } = setup({ redisDown: true });
        const out = await client.getPublicProfiles(['1']);
        expect(auth.getPublicProfilesByIds).toHaveBeenCalledTimes(1);
        expect(out[0]?.id).toBe('1');
    });

    it('calls auth with a service token for the auth audience and a 3s deadline', async () => {
        const { client, auth, serviceMetadata } = setup();
        await client.getPublicProfiles(['1']);
        expect(serviceMetadata.attach).toHaveBeenCalledWith(expect.any(Metadata), 'auth');
        const opts = auth.getPublicProfilesByIds.mock.calls[0][2] as { deadline: number };
        expect(opts.deadline - Date.now()).toBeLessThanOrEqual(3000);
    });
});

describe('PublicProfileClient.getPublicProfiles batching (auth caps one call at 500 ids)', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `id${i}`);

    it('exactly PROFILE_BATCH_SIZE (500) misses still cost ONE rpc', async () => {
        const { client, auth } = setup();
        await client.getPublicProfiles(ids(PROFILE_BATCH_SIZE));
        expect(auth.getPublicProfilesByIds).toHaveBeenCalledTimes(1);
    });

    it('1200 misses -> 3 RPCs of <=500, order and nulls kept', async () => {
        const { client, auth } = setup();
        const input = [...ids(1198), 'gone-x', 'id5'];
        const out = await client.getPublicProfiles(input);
        const sizes = auth.getPublicProfilesByIds.mock.calls.map((c) => (c[0] as { userIds: string[] }).userIds.length);
        expect(sizes.sort((a, b) => b - a)).toEqual([500, 500, 199]);
        expect(out.map((p) => p?.id ?? null)).toEqual(input.map((i) => (i.startsWith('gone') ? null : i)));
    });

    it('never runs more than 4 chunk RPCs at once', async () => {
        const { client, auth } = setup();
        let live = 0;
        let peak = 0;
        auth.getPublicProfilesByIds.mockImplementation((req: { userIds: string[] }) =>
            defer(async () => {
                peak = Math.max(peak, ++live);
                await new Promise((r) => setTimeout(r, 5));
                live--;
                return { profiles: req.userIds.map((i) => profile(i)) };
            })
        );
        await client.getPublicProfiles(ids(4200));
        expect(auth.getPublicProfilesByIds).toHaveBeenCalledTimes(9);
        expect(peak).toBeLessThanOrEqual(4);
        expect(peak).toBeGreaterThan(1);
    });

    it('a chunk that is UNAVAILABLE degrades only its own ids (non-strict)', async () => {
        const { client, auth } = setup();
        auth.getPublicProfilesByIds.mockImplementation((req: { userIds: string[] }) =>
            req.userIds.includes('id0')
                ? throwError(() => grpcError(status.UNAVAILABLE))
                : of({ profiles: req.userIds.map((i) => profile(i)) })
        );
        const out = await client.getPublicProfiles(ids(1000));
        expect(out.slice(0, 500).every((p) => p === null)).toBe(true);
        expect(out.slice(500).every((p) => p !== null)).toBe(true);
    });

    it('strict: an UNAVAILABLE chunk fails the whole lookup with 503', async () => {
        const { client, auth } = setup();
        auth.getPublicProfilesByIds.mockImplementation((req: { userIds: string[] }) =>
            req.userIds.includes('id700')
                ? throwError(() => grpcError(status.UNAVAILABLE))
                : of({ profiles: req.userIds.map((i) => profile(i)) })
        );
        await expect(client.getPublicProfiles(ids(1000), buildMetadata(), { strict: true })).rejects.toMatchObject({
            status: 503,
        });
    });
});

describe('PublicProfileClient cache-aside vs invalidation (tombstone)', () => {
    it('invalidate also leaves a short-lived tombstone', async () => {
        const { client, store, redisClient } = setup({ cached: { [profileCacheKey('1')]: '{}' } });
        await client.invalidate('1');
        expect(store.has(profileCacheKey('1'))).toBe(false);
        expect(store.has(profileTombstoneKey('1'))).toBe(true);
        expect(redisClient.set).toHaveBeenCalledWith(profileTombstoneKey('1'), '1', 'EX', 30);
    });

    it('an invalidation that lands between the RPC and the cache write is not overwritten by the stale profile', async () => {
        const { client, auth, store } = setup();
        auth.getPublicProfilesByIds.mockImplementation((req: { userIds: string[] }) =>
            defer(async () => {
                await client.invalidate('2'); // auth.user.updated consumed while the RPC is in flight
                return { profiles: req.userIds.map((i) => profile(i)) };
            })
        );
        const out = await client.getPublicProfiles(['1', '2']);
        expect(out.map((p) => p?.id)).toEqual(['1', '2']); // still answered
        expect(store.has(profileCacheKey('1'))).toBe(true);
        expect(store.has(profileCacheKey('2'))).toBe(false); // but not cached stale
    });
});

describe('PublicProfileClient cache write is one atomic tombstone-guarded step', () => {
    it('uses a single pipeline of Lua guarded SETs: no separate EXISTS round trip', async () => {
        const { client, redisClient } = setup();
        await client.getPublicProfiles(['1', '2']);
        expect(redisClient.pipeline).toHaveBeenCalledTimes(1);
        const p = redisClient.pipeline.mock.results[0].value;
        expect(p.exists).not.toHaveBeenCalled();
        expect(p.set).not.toHaveBeenCalled();
        expect(p.eval).toHaveBeenCalledTimes(2);
        expect(p.exec).toHaveBeenCalledTimes(1);
        const script = p.eval.mock.calls[0][0] as string;
        expect(script).toMatch(/EXISTS/);
        expect(script).toMatch(/SET/);
    });

    it('a tombstoned id is not cached, the others are', async () => {
        const { client, store } = setup({ cached: { [profileTombstoneKey('2')]: '1' } });
        await client.getPublicProfiles(['1', '2']);
        expect(store.has(profileCacheKey('1'))).toBe(true);
        expect(store.has(profileCacheKey('2'))).toBe(false);
    });
});

describe('PublicProfileClient.invalidate', () => {
    it('invalidate deletes the cache key', async () => {
        const { client, store } = setup({ cached: { [profileCacheKey('1')]: '{}' } });
        await client.invalidate('1');
        expect(store.has(profileCacheKey('1'))).toBe(false);
    });
});

describe('PublicProfileClient cache key prefix', () => {
    it('reads and writes under the configured prefix only', async () => {
        const { client, store } = setup();
        await client.getPublicProfiles(['7']);
        expect([...store.keys()]).toEqual([`${PREFIX}7`]);
        await client.invalidate('7');
        expect(store.has(`${PREFIX}7:inv`)).toBe(true);
    });
});
