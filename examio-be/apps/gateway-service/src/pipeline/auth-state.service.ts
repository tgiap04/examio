import { Logger } from '@nestjs/common';
import type { AuthUser } from '@examio/auth-jwt';

/** The Redis operations the revoke / `av` state needs. */
export interface AuthStateRedis {
    mget(...keys: string[]): Promise<(string | null)[]>;
    /** Lua SETMAX: store `value` only if it is greater than the current one. */
    setMax(key: string, value: number): Promise<unknown>;
    setRevoked(key: string, ttlSeconds: number): Promise<unknown>;
}

export type AuthVerdict = 'ok' | 'revoked' | 'stale' | 'unavailable';

export const revokedKey = (sid: string): string => `gw:revoked:sid:${sid}`;
export const authzVersionKey = (userId: string): string => `gw:user:${userId}:av`;

const DEFAULT_TIMEOUT_MS = 500;
const WARN_EVERY_MS = 30_000;
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'UPGRADE']);

const isAdminPath = (pathname: string): boolean =>
    pathname === '/api/v1/admin' || pathname.startsWith('/api/v1/admin/');

/**
 * Revoked-session and stale-`av` checks (one `MGET` per authenticated request)
 * plus the writers behind `GatewayControl` and the durable `authz_changed`
 * consumer.
 *
 * Redis outage (RT-3): admin routes and every state-changing request fail
 * closed; non-admin GET/HEAD/WS pass, logged (rate-limited) and counted.
 */
export class AuthStateService {
    private readonly logger = new Logger(AuthStateService.name);
    private readonly timeoutMs: number;
    private readonly now: () => number;
    private lastWarnAt = 0;
    readonly counters = { redisUnavailable: 0, failedOpen: 0 };

    constructor(
        private readonly redis: AuthStateRedis,
        options: { timeoutMs?: number; now?: () => number } = {}
    ) {
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.now = options.now ?? Date.now;
    }

    async check(
        user: Pick<AuthUser, 'id' | 'sid' | 'av'>,
        req: { method: string; pathname: string }
    ): Promise<AuthVerdict> {
        let values: (string | null)[];
        try {
            values = await this.withTimeout(
                this.redis.mget(revokedKey(user.sid), authzVersionKey(user.id))
            );
        } catch (err) {
            return this.onOutage(err, req);
        }
        const [revoked, stored] = values;
        if (revoked) return 'revoked';
        const current = stored === null || stored === undefined ? NaN : Number(stored);
        return Number.isFinite(current) && user.av < current ? 'stale' : 'ok';
    }

    /** `RevokeSession`: deny `sid` until the token would have expired anyway. */
    async revokeSession(sid: string, expEpochSeconds: number): Promise<void> {
        const ttl = Math.max(Math.ceil(expEpochSeconds - this.now() / 1000), 1);
        await this.redis.setRevoked(revokedKey(sid), ttl);
    }

    /** `InvalidateUser` and the durable event: idempotent, order-safe. */
    async raiseAuthzVersion(userId: string, authzVersion: number): Promise<void> {
        await this.redis.setMax(authzVersionKey(userId), authzVersion);
    }

    private onOutage(err: unknown, req: { method: string; pathname: string }): AuthVerdict {
        this.counters.redisUnavailable++;
        const failOpen = READ_ONLY_METHODS.has(req.method) && !isAdminPath(req.pathname);
        if (failOpen) this.counters.failedOpen++;
        const at = this.now();
        if (at - this.lastWarnAt > WARN_EVERY_MS) {
            this.lastWarnAt = at;
            this.logger.warn(
                `Auth state unavailable (${err instanceof Error ? err.message : String(err)}); ` +
                    `${failOpen ? 'passing read-only request' : 'rejecting'} ` +
                    `(total ${this.counters.redisUnavailable})`
            );
        }
        return failOpen ? 'ok' : 'unavailable';
    }

    private withTimeout<T>(work: Promise<T>): Promise<T> {
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`Redis did not answer within ${this.timeoutMs}ms`)),
                this.timeoutMs
            );
        });
        return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
    }
}
