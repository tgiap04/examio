import type { IncomingHttpHeaders } from 'http';
import { ulid } from 'ulid';

export type ForwardMode = 'verified' | 'anonymous' | 'passthrough';

/** What the dispatcher decided about this request; read by the proxy's header hooks. */
export interface ForwardContext {
    requestId: string;
    mode: ForwardMode;
    /** The verified access token (mode `verified` only). */
    token?: string;
    /** Remove the client's `authorization` and `accessToken` cookie (mode `anonymous`). */
    stripToken: boolean;
    ip: string;
    proto: string;
    host?: string;
}

export interface HeaderTarget {
    setHeader(name: string, value: string): unknown;
    removeHeader(name: string): unknown;
}

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/** Reuses a well-formed inbound `x-request-id`, otherwise mints `req_<ulid>` (same rule as the logger). */
export function resolveRequestId(headers: IncomingHttpHeaders): string {
    const incoming = headers['x-request-id'];
    const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
    return candidate && SAFE_REQUEST_ID.test(candidate) ? candidate : `req_${ulid()}`;
}

/**
 * Client-supplied hop/rewrite hints an upstream framework might trust. The
 * gateway sets its own `x-forwarded-for/proto/host`; these it never speaks for.
 */
const ALWAYS_REMOVED = [
    'forwarded',
    'x-real-ip',
    'x-forwarded-port',
    'x-forwarded-prefix',
    'x-forwarded-server',
    'x-original-url',
    'x-rewrite-url',
];
const ACCESS_COOKIE = /^\s*accessToken\s*=/;

/** `undefined` when no cookie is left. */
export function stripAccessTokenCookie(cookie: string | undefined): string | undefined {
    if (!cookie) return undefined;
    const kept = cookie.split(';').filter((part) => !ACCESS_COOKIE.test(part));
    return kept.length ? kept.map((p) => p.trim()).join('; ') : undefined;
}

/**
 * The gateway is the only identity forwarder: client `x-user-*` never reaches an
 * upstream, `X-Forwarded-*` are overwritten (never appended) with what the
 * gateway computed, and a token that failed verification never leaves it.
 */
export function applyForwardHeaders(
    target: HeaderTarget,
    inbound: IncomingHttpHeaders,
    ctx: ForwardContext
): void {
    for (const name of Object.keys(inbound)) {
        if (name.toLowerCase().startsWith('x-user-')) target.removeHeader(name);
    }
    for (const name of ALWAYS_REMOVED) target.removeHeader(name);

    target.setHeader('x-request-id', ctx.requestId);
    target.setHeader('x-forwarded-for', ctx.ip);
    target.setHeader('x-real-ip', ctx.ip);
    target.setHeader('x-forwarded-proto', ctx.proto);
    if (ctx.host) target.setHeader('x-forwarded-host', ctx.host);
    else target.removeHeader('x-forwarded-host');

    if (ctx.mode === 'verified' && ctx.token) {
        target.setHeader('authorization', `Bearer ${ctx.token}`);
    } else if (ctx.mode === 'anonymous' && ctx.stripToken) {
        target.removeHeader('authorization');
        const cookie = stripAccessTokenCookie(
            Array.isArray(inbound.cookie) ? inbound.cookie.join('; ') : inbound.cookie
        );
        if (cookie) target.setHeader('cookie', cookie);
        else target.removeHeader('cookie');
    }
}
