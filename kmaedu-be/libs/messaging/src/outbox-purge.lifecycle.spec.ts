const stop = jest.fn();
let scheduled: { expr: string; cb: () => void } | undefined;
jest.mock('node-cron', () => ({
    schedule: (expr: string, cb: () => void) => {
        scheduled = { expr, cb };
        return { stop };
    },
}));

import { Logger } from '@nestjs/common';
import { OutboxPurgeService } from './outbox-purge.service';

describe('OutboxPurgeService lifecycle', () => {
    beforeEach(() => {
        stop.mockClear();
        scheduled = undefined;
    });

    it('schedules the purge daily at 03:00 and stops the task before shutdown completes', () => {
        const svc = new OutboxPurgeService({ query: jest.fn() } as never);

        svc.onApplicationBootstrap();
        expect(scheduled?.expr).toBe('0 3 * * *');
        svc.beforeApplicationShutdown();

        expect(stop).toHaveBeenCalledTimes(1);
    });

    it('shutdown before bootstrap is a no-op', () => {
        expect(() => new OutboxPurgeService({ query: jest.fn() } as never).beforeApplicationShutdown()).not.toThrow();
    });

    it('runs the purge from the cron callback and logs (never throws) on failure', async () => {
        const pool = { query: jest.fn().mockRejectedValue(new Error('db down')) };
        const err = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        new OutboxPurgeService(pool as never).onApplicationBootstrap();

        scheduled!.cb();
        await new Promise((r) => setImmediate(r));

        expect(pool.query).toHaveBeenCalled();
        expect(err).toHaveBeenCalledWith(expect.stringContaining('db down'));
        err.mockRestore();
    });

    it('keeps deleting while batches are full, across more than one batch', async () => {
        const full = 5000;
        const outboxCounts = [full, full, full, 7];
        const pool = {
            query: jest.fn(async (sql: string) => ({
                rows: [],
                rowCount: /outbox_events/.test(sql) ? outboxCounts.shift() : 0,
            })),
        };

        const res = await new OutboxPurgeService(pool as never).purge();

        expect(res.outbox).toBe(full * 3 + 7);
        expect(outboxCounts).toHaveLength(0);
    });
});
