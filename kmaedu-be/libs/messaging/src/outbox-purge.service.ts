import { Inject, Injectable, Logger, OnApplicationBootstrap, BeforeApplicationShutdown } from '@nestjs/common';
import * as cron from 'node-cron';
import { RELAY_POOL } from './messaging.constants';
import { RelayDb } from './relay-pool';

const PURGE_BATCH = 5000;
// Columns are TIMESTAMP(3) without time zone holding UTC (Prisma convention).
const NOW = "(now() AT TIME ZONE 'UTC')";

const PURGE_OUTBOX_SQL = `
DELETE FROM outbox_events WHERE seq IN (
    SELECT seq FROM outbox_events
    WHERE published_at < ${NOW} - interval '7 days' LIMIT ${PURGE_BATCH})`;

const PURGE_PROCESSED_SQL = `
DELETE FROM processed_events WHERE (consumer, event_id) IN (
    SELECT consumer, event_id FROM processed_events
    WHERE processed_at < ${NOW} - interval '14 days' LIMIT ${PURGE_BATCH})`;

/** Daily 03:00 retention: published outbox rows > 7 d, processed_events > 14 d. */
@Injectable()
export class OutboxPurgeService implements OnApplicationBootstrap, BeforeApplicationShutdown {
    private readonly logger = new Logger(OutboxPurgeService.name);
    private task: cron.ScheduledTask | null = null;

    constructor(@Inject(RELAY_POOL) private readonly pool: RelayDb) {}

    onApplicationBootstrap(): void {
        this.task = cron.schedule('0 3 * * *', () => {
            this.purge().catch((err) =>
                this.logger.error(`Outbox purge failed: ${(err as Error).message}`)
            );
        });
    }

    beforeApplicationShutdown(): void {
        this.task?.stop();
    }

    async purge(): Promise<{ outbox: number; processed: number }> {
        const outbox = await this.deleteInBatches(PURGE_OUTBOX_SQL);
        const processed = await this.deleteInBatches(PURGE_PROCESSED_SQL);
        this.logger.log(`Purged outbox_events=${outbox} processed_events=${processed}`);
        return { outbox, processed };
    }

    private async deleteInBatches(sql: string): Promise<number> {
        let total = 0;
        for (;;) {
            const res = await this.pool.query(sql);
            const n = res.rowCount ?? 0;
            total += n;
            if (n < PURGE_BATCH) return total;
        }
    }
}
