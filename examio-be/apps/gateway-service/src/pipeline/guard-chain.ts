import type { IncomingHttpHeaders } from 'http';
import { Logger } from '@nestjs/common';
import { hasPermission, type AuthUser, type TokenVerifier } from '@examio/auth-jwt';
import type { CompiledRoute, RouteTable } from '../routing/route-table';
import { authenticate } from './auth-check';
import type { AuthStateService } from './auth-state.service';
import type { ForwardMode } from './forward-headers';
import type { RateLimiterService } from './rate-limiter.service';

export interface GuardChainDeps {
    table: RouteTable;
    verify: TokenVerifier;
    state: Pick<AuthStateService, 'check'>;
    limiter: Pick<RateLimiterService, 'check'>;
    pages: { isEnabled(flag: string): Promise<boolean> };
}

export interface CheckInput {
    /** HTTP method, or `UPGRADE` for a WebSocket handshake. */
    method: string;
    pathname: string;
    headers: IncomingHttpHeaders;
    route: CompiledRoute;
    ip: string;
    contentLength?: number;
}

export type Decision =
    | { ok: true; mode: ForwardMode; user?: AuthUser; token?: string; stripToken: boolean }
    | { ok: false; status: number; code: string; retryAfterSec?: number };

const deny = (status: number, code: string, retryAfterSec?: number): Decision => ({
    ok: false,
    status,
    code,
    ...(retryAfterSec === undefined ? {} : { retryAfterSec }),
});

/**
 * Pipeline steps 2-7 shared by HTTP requests and WebSocket upgrades: authenticate
 * (verify + revoke/`av`), coarse permissions, page flag, body size, rate limit.
 */
export class GuardChain {
    private readonly logger = new Logger(GuardChain.name);

    constructor(private readonly deps: GuardChainDeps) {}

    async run(input: CheckInput): Promise<Decision> {
        const { table, verify, state, limiter, pages } = this.deps;
        const { route, method, pathname } = input;
        const auth = table.effectiveAuth(route, method, pathname);

        let user: AuthUser | undefined;
        let token: string | undefined;
        let mode: ForwardMode = 'passthrough';
        let stripToken = false;

        if (auth !== 'none') {
            const result = await authenticate(input.headers, auth, { method, pathname }, { verify, state });
            if (result.kind === 'reject') return deny(result.status, result.code);
            if (result.kind === 'user') {
                ({ user, token } = result);
                mode = 'verified';
            } else {
                mode = 'anonymous';
                stripToken = result.stripToken;
            }
        }

        if (user && auth === 'required' && route.permissions.length > 0) {
            if (!user.emailVerified) return deny(403, 'EMAIL_NOT_VERIFIED');
            if (!hasPermission(user.roles, ...route.permissions)) return deny(403, 'PERMISSION_DENIED');
        }

        if (route.pageFlag && !(await this.pageEnabled(route.pageFlag))) {
            return deny(403, 'PAGE_DISABLED');
        }

        // Declared size only; a chunked body is cut on the stream by `enforceBodyCap`.
        if (route.maxBodyBytes && (input.contentLength ?? 0) > route.maxBodyBytes) {
            return deny(413, 'PAYLOAD_TOO_LARGE');
        }

        const limit = table.rateLimitFor(method, pathname);
        const verdict = await limiter.check(limit, user?.id ?? input.ip);
        if (!verdict.allowed) return deny(429, 'RATE_LIMITED', verdict.retryAfterSec);

        return { ok: true, mode, user, token, stripToken };
    }

    /** Default-on: only an explicit `false` blocks, and a flag read error never takes the API down. */
    private async pageEnabled(flag: string): Promise<boolean> {
        try {
            return await this.deps.pages.isEnabled(flag);
        } catch (err) {
            this.logger.warn(`Page flag "${flag}" unreadable, failing open: ${String(err)}`);
            return true;
        }
    }
}
