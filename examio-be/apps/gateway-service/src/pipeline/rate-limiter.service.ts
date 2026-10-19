import { Logger } from '@nestjs/common';
import type { CompiledRateLimit } from '../routing/rate-limit-table';

export interface RateLimitStore {
    /** Atomically INCR the bucket; set its expiry on first hit. */
    hit(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>;
}

export interface RateLimitResult {
    allowed: boolean;
    retryAfterSec: number;
}

const WARN_EVERY_MS = 30_000;

/**
 * Fixed-window limiter, one bucket per `rateLimits` entry:
 * `gw:rl:<id>:<user id | client ip>:<window start>`. It fails open on a store
 * error (auth-service keeps its own throttler for the anonymous auth routes).
 */
export class RateLimiterService {
    private readonly logger = new Logger(RateLimiterService.name);
    private readonly now: () => number;
    private lastWarnAt = 0;
    failedOpen = 0;

    constructor(
        private readonly store: RateLimitStore,
        options: { now?: () => number } = {}
    ) {
        this.now = options.now ?? Date.now;
    }

    async check(
        limit: Pick<CompiledRateLimit, 'id' | 'max' | 'windowMs'>,
        subject: string
    ): Promise<RateLimitResult> {
        const at = this.now();
        const windowStart = at - (at % limit.windowMs);
        const key = `gw:rl:${limit.id}:${subject}:${windowStart}`;
        try {
            const { count, ttlMs } = await this.store.hit(key, limit.windowMs);
            if (count <= limit.max) return { allowed: true, retryAfterSec: 0 };
            const remainingMs = ttlMs > 0 ? ttlMs : windowStart + limit.windowMs - at;
            return { allowed: false, retryAfterSec: Math.max(Math.ceil(remainingMs / 1000), 1) };
        } catch (err) {
            this.failedOpen++;
            if (at - this.lastWarnAt > WARN_EVERY_MS) {
                this.lastWarnAt = at;
                this.logger.warn(
                    `Rate limiter unavailable, failing open: ${err instanceof Error ? err.message : String(err)}`
                );
            }
            return { allowed: true, retryAfterSec: 0 };
        }
    }
}
