import { R2_DELETE_STUCK_METRIC, R2DeleteWorker } from './r2-delete.worker';

type Row = { id: string; key: string; attempts: number };
const LEASE = '2026-10-23 10:02:00.123456+00';

function setup(rows: Row[], sender: { deleteObjects: jest.Mock }, maxAttempts = 10) {
    const queries: { sql: string; params: unknown[] }[] = [];
    const db = {
        query: jest.fn(async (sql: string, params: unknown[] = []) => {
            queries.push({ sql, params });
            if (sql.includes('FOR UPDATE SKIP LOCKED')) {
                return { rows: rows.map((r) => ({ ...r, lease: LEASE })), rowCount: rows.length };
            }
            if (sql.includes('attempts = attempts + 1')) {
                const ids = params[0] as string[];
                const hit = rows.filter((r) => ids.includes(r.id)).map((r) => ({ id: r.id, attempts: r.attempts + 1 }));
                return { rows: hit, rowCount: hit.length };
            }
            return { rows: [], rowCount: 0 };
        }),
    };
    const worker = new R2DeleteWorker({ pollMs: 10, maxAttempts }, db, sender);
    return { worker, queries };
}

describe('R2DeleteWorker.tick', () => {
    it('sends the claimed keys once, then deletes the rows', async () => {
        const sender = { deleteObjects: jest.fn().mockResolvedValue({ deletedCount: 1 }) };
        const { worker, queries } = setup([{ id: 'i1', key: 'k/1.png', attempts: 0 }], sender);
        await expect(worker.tick()).resolves.toBe(1);
        expect(sender.deleteObjects).toHaveBeenCalledTimes(1);
        expect(sender.deleteObjects).toHaveBeenCalledWith(['k/1.png']);
        const done = queries.find((q) => q.sql.startsWith('DELETE FROM r2_delete_tasks'));
        expect(done?.params).toEqual([['i1'], LEASE]);
        expect(done?.sql).toContain('next_attempt_at = $2::timestamptz');
        expect(queries.some((q) => q.sql.includes('attempts = attempts + 1'))).toBe(false);
    });

    it('claims with a lease (next_attempt_at pushed) before calling R2', async () => {
        const sender = { deleteObjects: jest.fn().mockResolvedValue({}) };
        const { worker, queries } = setup([{ id: 'i1', key: 'k', attempts: 0 }], sender);
        await worker.tick();
        expect(queries[0].sql).toContain('next_attempt_at = now() + make_interval(secs => $2)');
        expect(queries[0].params).toEqual([10, 120]);
        expect(queries[0].sql).toContain('FOR UPDATE SKIP LOCKED');
    });

    it('does nothing and never calls R2 when no task is due', async () => {
        const sender = { deleteObjects: jest.fn() };
        const { worker } = setup([], sender);
        await expect(worker.tick()).resolves.toBe(0);
        expect(sender.deleteObjects).not.toHaveBeenCalled();
    });

    it('on UNAVAILABLE keeps the rows, bumps attempts/backoff and records last_error', async () => {
        const sender = { deleteObjects: jest.fn().mockRejectedValue(new Error('14 UNAVAILABLE: r2 down')) };
        const { worker, queries } = setup([{ id: 'i1', key: 'k', attempts: 0 }], sender);
        await worker.tick();
        expect(queries.some((q) => q.sql.startsWith('DELETE FROM r2_delete_tasks'))).toBe(false);
        const fail = queries.find((q) => q.sql.includes('attempts = attempts + 1'));
        expect(fail?.sql).toContain('LEAST(power(2, attempts + 1) * 30, 3600)');
        expect(fail?.params).toEqual([['i1'], LEASE, '14 UNAVAILABLE: r2 down']);
        expect(fail?.sql).toContain('next_attempt_at = $2::timestamptz');
    });

    it('dedupes keys shared by several tasks in one batch', async () => {
        const sender = { deleteObjects: jest.fn().mockResolvedValue({}) };
        const { worker, queries } = setup(
            [
                { id: 'a', key: 'k', attempts: 0 },
                { id: 'b', key: 'k', attempts: 0 },
            ],
            sender
        );
        await worker.tick();
        expect(sender.deleteObjects).toHaveBeenCalledWith(['k']);
        expect(queries.find((q) => q.sql.startsWith('DELETE'))?.params).toEqual([['a', 'b'], LEASE]);
    });

    it('logs the stuck marker when the last allowed attempt fails', async () => {
        const sender = { deleteObjects: jest.fn().mockRejectedValue(new Error('boom')) };
        const { worker } = setup([{ id: 'i1', key: 'k', attempts: 9 }], sender);
        const error = jest.spyOn((worker as unknown as { logger: { error: () => void } }).logger, 'error').mockImplementation();
        await worker.tick();
        expect(error).toHaveBeenCalledWith(expect.stringContaining(R2_DELETE_STUCK_METRIC));
    });

    it('lease is configurable', async () => {
        const sender = { deleteObjects: jest.fn().mockResolvedValue({}) };
        const { queries } = (() => {
            const q: { sql: string; params: unknown[] }[] = [];
            const db = { query: jest.fn(async (sql: string, params: unknown[] = []) => (q.push({ sql, params }), { rows: [], rowCount: 0 })) };
            void new R2DeleteWorker({ leaseSeconds: 300, maxAttempts: 5 }, db, sender).tick();
            return { queries: q };
        })();
        await new Promise((r) => setImmediate(r));
        expect(queries[0].params).toEqual([5, 300]);
    });

    it('partial result: deletes succeeded keys, fails only the poison key with backoff', async () => {
        const sender = { deleteObjects: jest.fn().mockResolvedValue({ deletedCount: 1, failedKeys: ['bad'] }) };
        const { worker, queries } = setup(
            [
                { id: 'ok', key: 'good', attempts: 0 },
                { id: 'ko', key: 'bad', attempts: 3 },
            ],
            sender
        );
        await worker.tick();
        const done = queries.find((q) => q.sql.startsWith('DELETE FROM r2_delete_tasks'));
        expect(done?.params).toEqual([['ok'], LEASE]);
        const fail = queries.find((q) => q.sql.includes('attempts = attempts + 1'));
        expect(fail?.params).toEqual([['ko'], LEASE, expect.stringContaining('bad')]);
    });

    it('a duplicate-key task is failed together with its sibling when the key failed', async () => {
        const sender = { deleteObjects: jest.fn().mockResolvedValue({ failedKeys: ['k'] }) };
        const { worker, queries } = setup(
            [
                { id: 'a', key: 'k', attempts: 0 },
                { id: 'b', key: 'k', attempts: 0 },
            ],
            sender
        );
        await worker.tick();
        expect(queries.some((q) => q.sql.startsWith('DELETE'))).toBe(false);
        expect(queries.find((q) => q.sql.includes('attempts = attempts + 1'))?.params[0]).toEqual(['a', 'b']);
    });

    it('stops the poll loop on shutdown without waiting out the interval', async () => {
        const sender = { deleteObjects: jest.fn() };
        const { worker } = setup([], sender);
        (worker as unknown as { pollMs: number }).pollMs = 60_000;
        worker.onApplicationBootstrap();
        await new Promise((r) => setTimeout(r, 20));
        const started = Date.now();
        await worker.beforeApplicationShutdown();
        expect(Date.now() - started).toBeLessThan(1000);
    });
});
