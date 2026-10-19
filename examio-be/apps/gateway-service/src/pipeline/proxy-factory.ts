import type { IncomingMessage, ServerResponse } from 'http';
import type { Duplex } from 'stream';
import { Logger } from '@nestjs/common';
import { createProxyMiddleware, proxyEventsPlugin } from 'http-proxy-middleware';
import type { CompiledRoute } from '../routing/route-table';
import { rejectUpgrade, sendError } from './error-response';
import { isOverCap } from './body-cap';
import type { ForwardContext } from './forward-headers';

/** Per-request decisions the dispatcher hands to the proxy's header hooks. */
export const forwardContexts = new WeakMap<IncomingMessage, ForwardContext>();

export interface RouteProxy {
    (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void): unknown;
    /** Proxies an already authorised WebSocket handshake. */
    upgrade?: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
}

const logger = new Logger('GatewayProxy');

/** The one upstream allowed to set cookies. */
export const COOKIE_ISSUER_UPSTREAM = 'auth';

/**
 * Only auth issues cookies (accessToken / refreshToken). A Set-Cookie from any
 * other upstream (a bug, a compromised service) is dropped at the edge so it can
 * never plant or overwrite a browser cookie.
 */
export function stripForeignCookies(
    upstream: string,
    proxyRes: Pick<IncomingMessage, 'headers'>,
    route: string
): void {
    if (upstream === COOKIE_ISSUER_UPSTREAM || !proxyRes.headers['set-cookie']) return;
    delete proxyRes.headers['set-cookie'];
    logger.warn(`Dropped Set-Cookie from the "${upstream}" upstream on route "${route}"`);
}

/**
 * http-proxy pipes `proxyRes` into `res` and never ends `res` if the upstream
 * dies mid-body, so the client would hang until its own timeout. Cut it instead.
 */
function cutOnTruncation(proxyRes: IncomingMessage, res: { destroy(): unknown }): void {
    const cut = () => res.destroy();
    proxyRes.once('aborted', cut);
    proxyRes.once('error', cut);
}

/** Grace so the upstream timeout (a clean 504) fires before the inbound socket timeout (a reset). */
const SOCKET_TIMEOUT_GRACE_MS = 5_000;
const TIMEOUT_CODES = new Set(['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET']);

function onProxyError(err: Error, req: IncomingMessage, res: ServerResponse | Duplex): void {
    if (isOverCap(req)) return;
    const code = (err as NodeJS.ErrnoException).code ?? '';
    const timedOut = TIMEOUT_CODES.has(code);
    logger.warn(`Upstream error ${code || err.name} for ${req.method} ${(req.url ?? '').split('?')[0]}`);
    const requestId = forwardContexts.get(req)?.requestId ?? 'unknown';
    const status = timedOut ? 504 : 502;
    const reason = timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE';
    if ('writeHead' in res) {
        // A stream that already started cannot become an error response: cut it.
        if (res.headersSent) res.destroy();
        else sendError(res, status, reason, requestId);
    } else {
        rejectUpgrade(res, status, reason);
    }
}

/**
 * One streaming reverse proxy per route (no body buffering, no response
 * interception). `ws` stays off on purpose: with it on, hpm would attach its own
 * `upgrade` listener after the first HTTP request and proxy handshakes without
 * the gateway's checks; upgrades go through `ws-upgrade.handler.ts` instead.
 */
export function createRouteProxy(route: CompiledRoute): RouteProxy {
    if (!route.target) throw new Error(`Route "${route.id}" has no upstream target`);
    const proxy = createProxyMiddleware({
        target: route.target,
        changeOrigin: true,
        xfwd: false,
        ws: false,
        proxyTimeout: route.timeoutMs,
        timeout: route.timeoutMs === 0 ? 0 : route.timeoutMs + SOCKET_TIMEOUT_GRACE_MS,
        pathRewrite: route.pathRewrite
            ? { [route.pathRewrite.from.source]: route.pathRewrite.to }
            : undefined,
        ejectPlugins: true,
        plugins: [proxyEventsPlugin],
        on: {
            proxyRes: (proxyRes, _req, res) => {
                stripForeignCookies(route.upstream, proxyRes, route.id);
                cutOnTruncation(proxyRes, res);
            },
            error: onProxyError,
        },
    }) as RouteProxy;

    // Header hygiene is done by `prepareProxiedRequest` / `prepareUpgradeRequest`
    // BEFORE the proxy runs; a request that skipped it must never reach an upstream.
    const guarded: RouteProxy = (req, res, next) => {
        if (!forwardContexts.has(req)) {
            logger.error(`Refusing to proxy an unprepared request on route "${route.id}"`);
            sendError(res, 500, 'INTERNAL_ERROR', 'unknown');
            return;
        }
        return proxy(req, res, next);
    };
    guarded.upgrade = (req, socket, head) => {
        if (!forwardContexts.has(req)) {
            logger.error(`Refusing to proxy an unprepared upgrade on route "${route.id}"`);
            rejectUpgrade(socket, 500, 'INTERNAL_ERROR');
            return;
        }
        proxy.upgrade!(req, socket, head);
    };
    return guarded;
}
