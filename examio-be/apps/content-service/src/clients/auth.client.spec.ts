import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { of } from 'rxjs';
import { buildMetadata } from '@examio/grpc';
import { AuthClient, CONTENT_PROFILE_CACHE_PREFIX } from './auth.client';

const profile = (id: string) => ({ id, username: `u${id}`, name: `Name ${id}`, avatar: '' });

function setup() {
    const store = new Map<string, string>();
    const redisClient = {
        mget: jest.fn(async (...keys: string[]) => keys.map((k) => store.get(k) ?? null)),
        set: jest.fn(async (k: string, v: string) => (store.set(k, v), 'OK')),
        del: jest.fn(async (k: string) => (store.delete(k), 1)),
        pipeline: jest.fn(() => {
            const ops: Array<() => unknown> = [];
            const p = {
                eval: jest.fn((_s: string, _n: number, key: string, _tomb: string, v: string) => {
                    ops.push(() => store.set(key, v));
                    return p;
                }),
                exec: jest.fn(async () => ops.map((o) => [null, o()])),
            };
            return p;
        }),
    };
    const auth = {
        getPublicProfilesByIds: jest.fn((req: { userIds: string[] }) =>
            of({ profiles: req.userIds.map(profile) })
        ),
    };
    const users = { searchUsers: jest.fn((..._a: unknown[]) => of({ profiles: [profile('s1')] })) };
    const attach = jest.fn(async (md: Metadata, _aud: string) => md);
    const client = new AuthClient(
        { getService: (n: string) => (n === 'AuthUserService' ? users : auth) } as unknown as ClientGrpc,
        { getClient: () => redisClient } as never,
        { attach } as never,
        CONTENT_PROFILE_CACHE_PREFIX
    );
    client.onModuleInit();
    return { client, users, store, redisClient, attach };
}

describe('AuthClient (content)', () => {
    it('caches profiles under the content namespace and invalidates there', async () => {
        const { client, store } = setup();
        await client.getPublicProfiles(['1']);
        expect([...store.keys()]).toEqual([`${CONTENT_PROFILE_CACHE_PREFIX}1`]);
        expect(CONTENT_PROFILE_CACHE_PREFIX).toBe('content:cache:user:');
        await client.invalidate('1');
        expect(store.has('content:cache:user:1')).toBe(false);
        expect(store.has('content:cache:user:1:inv')).toBe(true);
    });

    it('searchUsers forwards the caller metadata and returns the display-safe profiles', async () => {
        const { client, users, attach } = setup();
        const md = buildMetadata({ authorization: 'Bearer user-token' });
        const out = await client.searchUsers('abc', 20, md);
        expect(users.searchUsers.mock.calls[0][0]).toEqual({ query: 'abc', limit: 20 });
        expect(users.searchUsers.mock.calls[0][1]).toBe(md);
        expect(attach).toHaveBeenCalledWith(md, 'auth');
        expect(out).toEqual([{ ...profile('s1'), avatar: null }]);
    });
});
