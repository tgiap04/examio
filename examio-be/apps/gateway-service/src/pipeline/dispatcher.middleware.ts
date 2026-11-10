import type { IncomingMessage } from 'http';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { RouteTable } from '../routing/route-table';
import { clientIp, forwardedHost, forwardedProto, type TrustFn } from './client-ip';
import { drainRequest } from './body-cap';
import { sendError } from './error-response';
import { resolveRequestId } from './forward-headers';
import type { GuardChain } from './guard-chain';
import { prepareProxiedRequest } from './prepare-request';
import type { RouteProxy } from './proxy-factory';
import type { RequestLog } from './request-log';

export interface DispatcherDeps {
    table: RouteTable;
    chain: GuardChain;
    proxies: ReadonlyMap<string, RouteProxy>;
    trust: TrustFn;
    log: Pick<RequestLog, 'attach'>;
}

const logger = new Logger('Dispatcher');

export function pathnameOf(url: string | undefined): string {
    const raw = url ?? '/';
    const query = raw.indexOf('?');
    return query === -1 ? raw : raw.slice(0, query);
}

export function contentLengthOf(req: IncomingMessage): number | undefined {
    const value = Number(req.headers['content-length']);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Mounted pathless (`app.use`) so it sees the full URL: match a route, run the
 * guard chain, then stream to the upstream. Routes served by the gateway itself
 * (`upstream: self`) and `/health/*` fall through to Nest after the checks.
 */
export function createDispatcher(deps: DispatcherDeps): RequestHandler {
    const { table, chain, proxies, trust, log } = deps;

    async function handle(req: Request, res: Response, next: NextFunction, requestId: string) {
        const pathname = pathnameOf(req.url);
        const route = table.match(req.method, pathname);
        if (!route) return sendError(res, 404, 'ROUTE_NOT_FOUND', requestId);

        const ip = clientIp(req, trust);
        const decision = await chain.run({
            method: req.method,
            pathname,
            headers: req.headers,
            route,
            ip,
            contentLength: contentLengthOf(req),
        });
        if (!decision.ok) {
            const headers: Record<string, string> = {};
            if (decision.retryAfterSec) headers['Retry-After'] = String(decision.retryAfterSec);
            sendError(res, decision.status, decision.code, requestId, headers);
            // A declared-too-large body is still on its way: drain it within a bound.
            if (decision.status === 413) drainRequest(req);
            return;
        }
        if (!route.target) return next();

        prepareProxiedRequest(req, res, route, {
            requestId,
            mode: decision.mode,
            token: decision.token,
            stripToken: decision.stripToken,
            ip,
            proto: forwardedProto(req),
            host: forwardedHost(req),
        });
        proxies.get(route.id)!(req, res, (err?: unknown) =>
            err ? sendError(res, 502, 'UPSTREAM_UNAVAILABLE', requestId) : next()
        );
    }

    return (req, res, next) => {
        const pathname = pathnameOf(req.url);
        if (pathname === '/health' || pathname.startsWith('/health/')) return next();

        const requestId = resolveRequestId(req.headers);
        res.setHeader('X-Request-Id', requestId);
        log.attach(req, res);
        handle(req, res, next, requestId).catch((err: unknown) => {
            logger.error(`Dispatcher failure: ${err instanceof Error ? err.stack : String(err)}`);
            sendError(res, 500, 'INTERNAL_ERROR', requestId);
        });
    };
}
