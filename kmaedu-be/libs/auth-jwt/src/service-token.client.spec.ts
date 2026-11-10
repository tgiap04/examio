import {
    ServiceTokenClient,
    type ServiceTokenSource,
} from './service-token.client';

function setup(ttlSeconds = 300) {
    let now = 1_000_000;
    let n = 0;
    const fetchToken = jest.fn<
        ReturnType<ServiceTokenSource['fetch']>,
        [string]
    >(async (audience) => {
        await Promise.resolve();
        n++;
        return {
            token: `${audience}-${n}`,
            expiresAt: now + ttlSeconds * 1000,
        };
    });
    const client = new ServiceTokenClient({ fetch: fetchToken }, () => now);
    return {
        client,
        fetchToken,
        advance: (ms: number) => {
            now += ms;
        },
    };
}

describe('ServiceTokenClient', () => {
    it('fetches once per audience within the TTL', async () => {
        const { client, fetchToken } = setup();
        expect(await client.getToken('finance')).toBe('finance-1');
        expect(await client.getToken('finance')).toBe('finance-1');
        expect(await client.getToken('r2')).toBe('r2-2');
        expect(fetchToken).toHaveBeenCalledTimes(2);
    });

    it('refreshes at exp - 60s', async () => {
        const { client, fetchToken, advance } = setup(300);
        await client.getToken('finance');
        advance(238_000);
        expect(await client.getToken('finance')).toBe('finance-1');
        advance(2_000); // 240s = exp - 60s
        expect(await client.getToken('finance')).toBe('finance-2');
        expect(fetchToken).toHaveBeenCalledTimes(2);
    });

    it('shares one in-flight fetch between concurrent callers', async () => {
        const { client, fetchToken } = setup();
        const tokens = await Promise.all(
            Array.from({ length: 10 }, () => client.getToken('finance'))
        );
        expect(new Set(tokens).size).toBe(1);
        expect(fetchToken).toHaveBeenCalledTimes(1);
    });

    it('retries a failed fetch with backoff and then succeeds', async () => {
        let calls = 0;
        const sleeps: number[] = [];
        const client = new ServiceTokenClient(
            {
                fetch: async () => {
                    calls++;
                    if (calls < 3) throw new Error('auth down');
                    return { token: 't', expiresAt: Date.now() + 300_000 };
                },
            },
            Date.now,
            async (ms) => {
                sleeps.push(ms);
            }
        );
        await expect(client.getToken('finance')).resolves.toBe('t');
        expect(calls).toBe(3);
        expect(sleeps).toEqual([200, 400]);
    });

    it('throws after the retries are exhausted and does not cache the failure', async () => {
        let calls = 0;
        const client = new ServiceTokenClient(
            {
                fetch: async () => {
                    calls++;
                    throw new Error('auth down');
                },
            },
            Date.now,
            async () => undefined
        );
        await expect(client.getToken('finance')).rejects.toThrow('auth down');
        expect(calls).toBe(3);
        await expect(client.getToken('finance')).rejects.toThrow('auth down');
        expect(calls).toBe(6);
    });

    it('serves the still-valid cached token when auth is briefly down inside the refresh window', async () => {
        let fail = false;
        let now = 1_000_000;
        const client = new ServiceTokenClient(
            {
                fetch: async () => {
                    if (fail) throw new Error('auth down');
                    return { token: 'cached', expiresAt: now + 300_000 };
                },
            },
            () => now,
            async () => undefined
        );
        await client.getToken('finance');
        now += 250_000; // inside the refresh window, token still valid
        fail = true;
        await expect(client.getToken('finance')).resolves.toBe('cached');
    });
});
