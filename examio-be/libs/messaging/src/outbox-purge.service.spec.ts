import { OutboxPurgeService } from './outbox-purge.service';

describe('OutboxPurgeService.purge', () => {
    it('deletes in batches of 5000 until a batch returns fewer rows', async () => {
        const counts = [5000, 5000, 120, 0];
        const pool = {
            query: jest.fn(async (sql: string) => ({
                rows: [],
                rowCount: /outbox_events/.test(sql) ? counts.shift() ?? 0 : 3,
            })),
        };
        const svc = new OutboxPurgeService(pool as never);

        const res = await svc.purge();

        expect(res.outbox).toBe(10120);
        expect(res.processed).toBeGreaterThanOrEqual(0);
        const sqls = pool.query.mock.calls.map((c) => c[0] as string);
        expect(sqls.some((s) => /published_at < \(now\(\) AT TIME ZONE 'UTC'\) - interval '7 days'/.test(s))).toBe(true);
        expect(sqls.some((s) => /processed_at < \(now\(\) AT TIME ZONE 'UTC'\) - interval '14 days'/.test(s))).toBe(true);
        expect(sqls.every((s) => /LIMIT 5000/.test(s))).toBe(true);
    });
});
