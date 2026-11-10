import {
    BeforeApplicationShutdown,
    Inject,
    Injectable,
    Logger,
    OnApplicationBootstrap,
} from '@nestjs/common';
import { RelayDb } from '../relay-pool';
import {
    R2_DELETE_DB,
    R2_DELETE_OPTIONS,
    R2_DELETE_SENDER,
    R2DeleteResult,
    R2DeleteSender,
    R2DeleteWorkerOptions,
} from './r2-delete.constants';

const BATCH = 100; // r2.v1 DeleteObjects accepts at most 100 keys from this worker
const DEFAULT_LEASE_SECONDS = 120;
// Must stay above the worst-case send (3 attempts x 10 s deadline + token fetch, ~34 s),
// or a second worker re-claims rows that are still in flight.
const MIN_LEASE_SECONDS = 60;
const MAX_BACKOFF_SECONDS = 3600;
const BASE_BACKOFF_SECONDS = 30;
const DEFAULT_POLL_MS = 5000;
const DEFAULT_MAX_ATTEMPTS = 10;
const ERROR_MAX_CHARS = 500;

/** Marker an alert rule can match: a task that exhausted its retries and needs a human. */
export const R2_DELETE_STUCK_METRIC = 'r2_delete_task_stuck';

/**
 * One autocommitted statement = the short claim tx: due rows are locked with
 * SKIP LOCKED (parallel workers never share a row) and pushed `$2` seconds ahead
 * (the lease). `now()` is constant inside the statement, so every claimed row
 * carries the same lease value, returned as text to keep microsecond precision.
 * DONE and FAIL only touch rows still carrying that exact lease: a worker whose
 * lease expired mid-call can neither delete nor fail rows another worker re-claimed.
 */
const CLAIM_SQL = `
UPDATE r2_delete_tasks SET next_attempt_at = now() + make_interval(secs => $2)
WHERE id IN (
    SELECT id FROM r2_delete_tasks
    WHERE next_attempt_at <= now() AND attempts < $1
    ORDER BY next_attempt_at, created_at LIMIT ${BATCH} FOR UPDATE SKIP LOCKED)
RETURNING id::text AS id, key, attempts, next_attempt_at::text AS lease`;

const DONE_SQL = 'DELETE FROM r2_delete_tasks WHERE id = ANY($1::uuid[]) AND next_attempt_at = $2::timestamptz';

const FAIL_SQL = `
UPDATE r2_delete_tasks SET
    attempts = attempts + 1,
    next_attempt_at = now() + make_interval(secs => LEAST(power(2, attempts + 1) * ${BASE_BACKOFF_SECONDS}, ${MAX_BACKOFF_SECONDS})),
    last_error = $3
WHERE id = ANY($1::uuid[]) AND next_attempt_at = $2::timestamptz
RETURNING id::text AS id, attempts`;

interface ClaimedTask {
    id: string;
    key: string;
    attempts: number;
    lease: string;
}

@Injectable()
export class R2DeleteWorker implements OnApplicationBootstrap, BeforeApplicationShutdown {
    private readonly logger = new Logger(R2DeleteWorker.name);
    private readonly pollMs: number;
    private readonly maxAttempts: number;
    private readonly leaseSeconds: number;
    private running = false;
    private loop: Promise<void> | null = null;
    private wake: (() => void) | null = null;

    constructor(
        @Inject(R2_DELETE_OPTIONS) options: R2DeleteWorkerOptions,
        @Inject(R2_DELETE_DB) private readonly db: RelayDb,
        @Inject(R2_DELETE_SENDER) private readonly sender: R2DeleteSender
    ) {
        this.pollMs = options.pollMs ?? (Number(process.env.R2_DELETE_POLL_MS) || DEFAULT_POLL_MS);
        this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
        const lease =
            options.leaseSeconds ?? (Number(process.env.R2_DELETE_LEASE_SECONDS) || DEFAULT_LEASE_SECONDS);
        if (lease < MIN_LEASE_SECONDS && options.leaseSeconds === undefined) {
            this.logger.warn(
                `R2_DELETE_LEASE_SECONDS=${lease} is below ${MIN_LEASE_SECONDS}s; using ${MIN_LEASE_SECONDS}s`
            );
        }
        // Tests may pass a short lease explicitly; env/config values are floored.
        this.leaseSeconds = options.leaseSeconds ?? Math.max(lease, MIN_LEASE_SECONDS);
    }

    onApplicationBootstrap(): void {
        this.running = true;
        this.loop = this.run();
    }

    async beforeApplicationShutdown(): Promise<void> {
        this.running = false;
        this.wake?.();
        await this.loop;
    }

    /** Claims and processes one batch; returns the number of tasks claimed. */
    async tick(): Promise<number> {
        const { rows } = await this.db.query(CLAIM_SQL, [this.maxAttempts, this.leaseSeconds]);
        const tasks = rows as ClaimedTask[];
        if (tasks.length === 0) return 0;
        const lease = tasks[0].lease;

        let result: R2DeleteResult | void;
        try {
            result = await this.sender.deleteObjects([...new Set(tasks.map((t) => t.key))]);
        } catch (err) {
            await this.markFailed(tasks, lease, (err?.message ?? String(err)) as string);
            return tasks.length;
        }
        // Only keys R2 reported as failed are retried; the rest (including keys already gone) are done.
        const failedKeys = new Set(result?.failedKeys ?? []);
        const failed = tasks.filter((t) => failedKeys.has(t.key));
        const done = tasks.filter((t) => !failedKeys.has(t.key));
        if (done.length > 0) {
            await this.db.query(DONE_SQL, [done.map((t) => t.id), lease]);
        }
        if (failed.length > 0) {
            const sample = [...new Set(failed.map((t) => t.key))].slice(0, 3).join(', ');
            await this.markFailed(failed, lease, `R2 failed to delete ${failedKeys.size} key(s): ${sample}`);
        }
        return tasks.length;
    }

    private async markFailed(tasks: ClaimedTask[], lease: string, raw: string): Promise<void> {
        const message = raw.slice(0, ERROR_MAX_CHARS);
        this.logger.warn(`R2 DeleteObjects failed for ${tasks.length} task(s): ${message}`);
        const { rows } = await this.db.query(FAIL_SQL, [tasks.map((t) => t.id), lease, message]);
        const keyById = new Map(tasks.map((t) => [t.id, t.key]));
        for (const row of rows as { id: string; attempts: number }[]) {
            if (row.attempts >= this.maxAttempts) {
                this.logger.error(
                    `${R2_DELETE_STUCK_METRIC} key=${keyById.get(row.id)} attempts=${row.attempts}: ${message}`
                );
            }
        }
    }

    private async run(): Promise<void> {
        while (this.running) {
            let claimed = 0;
            try {
                claimed = await this.tick();
            } catch (err) {
                this.logger.error(`R2 delete worker tick failed: ${(err as Error).message}`);
            }
            if (this.running && claimed < BATCH) await this.sleep();
        }
    }

    private sleep(): Promise<void> {
        return new Promise<void>((resolve) => {
            const timer = setTimeout(done, this.pollMs);
            this.wake = done;
            function done() {
                clearTimeout(timer);
                resolve();
            }
        }).finally(() => {
            this.wake = null;
        });
    }
}
