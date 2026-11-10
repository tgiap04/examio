import { toPgConnectionString } from './relay-pool';

describe('toPgConnectionString', () => {
    it('strips Prisma-only query params and keeps the rest', () => {
        const out = toPgConnectionString(
            'postgresql://u:p@db:5432/app?schema=public&connection_limit=10&pgbouncer=true&sslmode=require'
        );
        const url = new URL(out);
        expect(url.searchParams.get('schema')).toBeNull();
        expect(url.searchParams.get('connection_limit')).toBeNull();
        expect(url.searchParams.get('pgbouncer')).toBeNull();
        expect(url.searchParams.get('sslmode')).toBe('require');
        expect(url.host).toBe('db:5432');
    });
});

describe('RelayPoolCloser', () => {
    it('ends the pool at shutdown and never throws', async () => {
        const { RelayPoolCloser } = await import('./relay-pool');
        const ok = { end: jest.fn().mockResolvedValue(undefined) };
        await new RelayPoolCloser(ok).onApplicationShutdown();
        expect(ok.end).toHaveBeenCalledTimes(1);

        const bad = { end: jest.fn().mockRejectedValue(new Error('already ended')) };
        await expect(new RelayPoolCloser(bad).onApplicationShutdown()).resolves.toBeUndefined();
    });
});

describe('createRelayPool', () => {
    it('requires a database url and caps the pool at 2 connections', async () => {
        const { createRelayPool } = await import('./relay-pool');
        expect(() => createRelayPool('')).toThrow(/DATABASE_URL/);

        const pool = createRelayPool('postgresql://u:p@127.0.0.1:1/db?schema=public');
        expect((pool as unknown as { options: { max: number } }).options.max).toBe(2);
        await pool.end();
    });
});
