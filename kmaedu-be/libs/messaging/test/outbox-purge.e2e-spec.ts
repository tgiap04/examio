import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { createRelayPool } from '../src/relay-pool';
import { OutboxPurgeService } from '../src/outbox-purge.service';

/** Real Postgres (migrations applied). Rows are tagged so parallel data is untouched. */
describe('OutboxPurgeService (e2e)', () => {
    const tag = randomUUID().slice(0, 8);
    const id = (n: string) => `evt_purge_${tag}_${n}`;
    let pool: Pool;

    const insertOutbox = (n: string, publishedDaysAgo: number | null) =>
        pool.query(
            `INSERT INTO outbox_events (id, source, type, envelope, published_at)
             VALUES ($1, 'purge-e2e', 'auth.test', '{}'::jsonb,
                     CASE WHEN $2::int IS NULL THEN NULL
                          ELSE (now() AT TIME ZONE 'UTC') - make_interval(days => $2::int) END)`,
            [id(n), publishedDaysAgo]
        );
    const insertProcessed = (n: string, daysAgo: number) =>
        pool.query(
            `INSERT INTO processed_events (consumer, event_id, processed_at)
             VALUES ('purge-e2e', $1, (now() AT TIME ZONE 'UTC') - make_interval(days => $2::int))`,
            [id(n), daysAgo]
        );
    const outboxIds = async () =>
        (await pool.query(`SELECT id FROM outbox_events WHERE id LIKE $1`, [`evt_purge_${tag}_%`])).rows.map((r) => r.id);
    const processedIds = async () =>
        (await pool.query(`SELECT event_id FROM processed_events WHERE event_id LIKE $1`, [`evt_purge_${tag}_%`])).rows.map((r) => r.event_id);

    beforeAll(() => {
        pool = createRelayPool();
    });

    afterAll(async () => {
        await pool.query(`DELETE FROM outbox_events WHERE id LIKE $1`, [`evt_purge_${tag}_%`]);
        await pool.query(`DELETE FROM processed_events WHERE event_id LIKE $1`, [`evt_purge_${tag}_%`]);
        await pool.end();
    });

    it('deletes outbox rows published >7d and processed rows >14d; keeps newer and unpublished rows', async () => {
        await insertOutbox('old-pub', 8);
        await insertOutbox('new-pub', 6);
        await insertOutbox('unpublished', null);
        await insertProcessed('old-proc', 15);
        await insertProcessed('new-proc', 13);

        const res = await new OutboxPurgeService(pool).purge();

        expect(res.outbox).toBeGreaterThanOrEqual(1);
        expect(res.processed).toBeGreaterThanOrEqual(1);
        expect((await outboxIds()).sort()).toEqual([id('new-pub'), id('unpublished')].sort());
        expect(await processedIds()).toEqual([id('new-proc')]);
    });
});
