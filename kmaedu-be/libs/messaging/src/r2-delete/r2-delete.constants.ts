export const R2_DELETE_OPTIONS = Symbol('R2_DELETE_OPTIONS');
export const R2_DELETE_DB = Symbol('R2_DELETE_DB');
export const R2_DELETE_SENDER = Symbol('R2_DELETE_SENDER');

/** Delivers one batch to r2.v1 `DeleteObjects` (a service token is attached by the implementation). */
export interface R2DeleteSender {
    deleteObjects(keys: string[]): Promise<R2DeleteResult | void>;
}

/** Per-key outcome of a batch; keys not listed in `failedKeys` are deleted (or already gone). */
export interface R2DeleteResult {
    failedKeys?: readonly string[];
}

export interface R2DeleteWorkerOptions {
    /** Idle poll interval (ms). Default `R2_DELETE_POLL_MS` or 5000. */
    pollMs?: number;
    /**
     * Claim lease (s): how long a claimed row is hidden from other workers. Must stay well above
     * the worst-case DeleteObjects call (deadline x retries). Default `R2_DELETE_LEASE_SECONDS` or 120.
     */
    leaseSeconds?: number;
    /** Attempts after which a task is left in the table, alerted on and no longer retried. */
    maxAttempts?: number;
}
