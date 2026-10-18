/**
 * A dependency probe used by `GET /health/ready`.
 * `check()` resolves when the dependency is usable and rejects otherwise.
 *
 * Implementations live next to the dependency they probe (libs/database,
 * libs/redis, ...). This library deliberately imports none of them.
 */
export interface ReadinessCheck {
    /** Key reported in the health payload, e.g. `database`. */
    readonly name: string;
    check(): Promise<void>;
}

/** Injection token for the list of checks `ready` runs. */
export const READINESS_CHECKS = Symbol('READINESS_CHECKS');

/** Optional injection token overriding the per-check timeout (ms). */
export const READINESS_TIMEOUT_MS = Symbol('READINESS_TIMEOUT_MS');

export const DEFAULT_READINESS_TIMEOUT_MS = 3000;
