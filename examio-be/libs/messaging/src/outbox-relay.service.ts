import {
    Inject,
    Injectable,
    Logger,
    OnApplicationBootstrap,
    BeforeApplicationShutdown,
} from '@nestjs/common';
import { AmqpConnection } from './amqp-connection';
import {
    MESSAGING_OPTIONS,
    MessagingServiceOptions,
    publishedSources,
    RELAY_POOL,
} from './messaging.constants';
import { RelayDb } from './relay-pool';
import { EVENTS_EXCHANGE } from './topology';

// Columns are TIMESTAMP(3) without time zone holding UTC (Prisma convention).
const NOW = "(now() AT TIME ZONE 'UTC')";

const POLL_MS = 500;
const BATCH = 100;
const LOCK_SECONDS = 30;
const PUBLISH_TIMEOUT_MS = 10_000;
const STALE_CHECK_MS = 60_000;
const STALE_AFTER_MINUTES = 5;

const CLAIM_SQL = `
UPDATE outbox_events SET locked_until = ${NOW} + interval '${LOCK_SECONDS} seconds'
WHERE seq IN (
    SELECT seq FROM outbox_events
    WHERE source = ANY($1::text[]) AND published_at IS NULL AND next_attempt_at <= ${NOW}
      AND (locked_until IS NULL OR locked_until < ${NOW})
    ORDER BY seq LIMIT ${BATCH} FOR UPDATE SKIP LOCKED)
RETURNING seq::text AS seq, envelope, attempts`;

const MARK_PUBLISHED_SQL = `
UPDATE outbox_events SET published_at = ${NOW}, locked_until = NULL
WHERE seq = ANY($1::bigint[])`;

const MARK_FAILED_SQL = `
UPDATE outbox_events AS o
SET attempts = o.attempts + 1,
    next_attempt_at = ${NOW} + make_interval(secs => LEAST(power(2, o.attempts), 300)),
    last_error = f.err,
    locked_until = NULL
FROM unnest($1::bigint[], $2::text[]) AS f(seq, err)
WHERE o.seq = f.seq`;

const STALE_SQL = `
SELECT count(*)::int AS n FROM outbox_events
WHERE source = ANY($1::text[]) AND published_at IS NULL
  AND created_at < ${NOW} - interval '${STALE_AFTER_MINUTES} minutes'`;

interface ClaimedRow {
    seq: string;
    envelope: { id: string; type: string; source: string };
    attempts: number;
}

/**
 * Claim-then-publish relay (worker role). The claim is one autocommitted
 * statement (a short tx), the broker round-trip happens with no DB lock held,
 * and the outcome is marked afterwards. A crash between publish and mark
 * re-publishes once the 30 s claim lock expires; consumers dedupe on event id.
 */
@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, BeforeApplicationShutdown {
    private readonly logger = new Logger(OutboxRelayService.name);
    private running = false;
    private loop: Promise<void> | null = null;
    private lastStaleCheck = 0;

    constructor(
        @Inject(MESSAGING_OPTIONS) private readonly options: MessagingServiceOptions,
        @Inject(RELAY_POOL) private readonly pool: RelayDb,
        private readonly amqp: AmqpConnection
    ) {}

    onApplicationBootstrap(): void {
        this.running = true;
        this.loop = this.run();
    }

    async beforeApplicationShutdown(): Promise<void> {
        this.running = false;
        await this.loop;
    }

    private async run(): Promise<void> {
        while (this.running) {
            let published = 0;
            try {
                published = await this.tick();
                await this.checkStale();
            } catch (err) {
                this.logger.error(`Outbox relay tick failed: ${(err as Error).message}`);
            }
            // Drain a full backlog without sleeping.
            if (published < BATCH) await new Promise((r) => setTimeout(r, POLL_MS));
        }
    }

    /** One claim / publish / mark cycle; returns the number of rows claimed. */
    async tick(): Promise<number> {
        // While the broker is away nothing is claimed, so no attempt/backoff is
        // burnt and the backlog flushes the moment the connection returns.
        if (!this.amqp.isConnected()) return 0;

        const claimed = await this.pool.query(CLAIM_SQL, [publishedSources(this.options)]);
        const rows = (claimed.rows as ClaimedRow[]).sort((a, b) =>
            BigInt(a.seq) < BigInt(b.seq) ? -1 : 1
        );
        if (rows.length === 0) return 0;

        const results = await Promise.allSettled(rows.map((r) => this.publishRow(r)));

        const ok: string[] = [];
        const failedSeq: string[] = [];
        const failedErr: string[] = [];
        results.forEach((res, i) => {
            if (res.status === 'fulfilled') return ok.push(rows[i].seq);
            failedSeq.push(rows[i].seq);
            failedErr.push(String(res.reason?.message ?? res.reason).slice(0, 500));
            this.logger.warn(
                `Outbox publish failed id=${rows[i].envelope.id} type=${rows[i].envelope.type}: ${failedErr[failedErr.length - 1]}`
            );
        });
        if (ok.length > 0) await this.pool.query(MARK_PUBLISHED_SQL, [ok]);
        if (failedSeq.length > 0) {
            await this.pool.query(MARK_FAILED_SQL, [failedSeq, failedErr]);
        }
        return rows.length;
    }

    private async publishRow(row: ClaimedRow): Promise<unknown> {
        const { envelope } = row;
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error('publish confirm timed out')),
                PUBLISH_TIMEOUT_MS
            );
        });
        try {
            return await Promise.race([
                this.amqp.publisher.publish(
                    EVENTS_EXCHANGE,
                    envelope.type,
                    Buffer.from(JSON.stringify(envelope)),
                    {
                        persistent: true,
                        messageId: envelope.id,
                        contentType: 'application/json',
                    }
                ),
                timeout,
            ]);
        } finally {
            clearTimeout(timer);
        }
    }

    /** Alert hook: any row unpublished for more than 5 minutes logs at error level. */
    private async checkStale(): Promise<void> {
        const now = Date.now();
        if (now - this.lastStaleCheck < STALE_CHECK_MS) return;
        this.lastStaleCheck = now;
        const res = await this.pool.query(STALE_SQL, [publishedSources(this.options)]);
        const n = res.rows[0]?.n ?? 0;
        if (n > 0) {
            this.logger.error(
                `ALERT outbox: ${n} event(s) unpublished for more than ${STALE_AFTER_MINUTES} minutes (source=${this.options.service})`
            );
        }
    }
}
