import type { IncomingMessage, ServerResponse } from 'http';
import { capRequestBody } from './body-cap';
import { applyForwardHeaders, type ForwardContext } from './forward-headers';
import { forwardContexts } from './proxy-factory';

/**
 * ALL header hygiene happens here, on the incoming request, before it is handed
 * to http-proxy (which copies `req.headers` into the upstream request). It must
 * not live in an http-proxy event: `proxyReq` is skipped whenever the outgoing
 * request has an `Expect` header, which would forward spoofed `x-user-*` and
 * `x-forwarded-*` untouched and skip the body cap.
 */
/** Node lower-cases header names; be exact anyway so a mixed-case key can never survive. */
function removeAnyCase(headers: IncomingMessage['headers'], name: string): void {
    const wanted = name.toLowerCase();
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === wanted) delete headers[key];
    }
}

function sanitizeHeaders(req: IncomingMessage, ctx: ForwardContext): void {
    const headers = req.headers;
    applyForwardHeaders(
        {
            setHeader: (name, value) => {
                removeAnyCase(headers, name);
                headers[name.toLowerCase()] = value;
            },
            removeHeader: (name) => removeAnyCase(headers, name),
        },
        { ...headers },
        ctx
    );
    // Node already answered `100 Continue`; the proxy just streams the body.
    removeAnyCase(headers, 'expect');
}

/** An authorised HTTP request about to be proxied. */
export function prepareProxiedRequest(
    req: IncomingMessage,
    res: ServerResponse,
    route: { maxBodyBytes?: number },
    ctx: ForwardContext
): void {
    forwardContexts.set(req, ctx);
    sanitizeHeaders(req, ctx);
    if (route.maxBodyBytes) capRequestBody(req, res, route.maxBodyBytes, ctx.requestId);
}

/** An authorised WebSocket handshake about to be proxied. */
export function prepareUpgradeRequest(req: IncomingMessage, ctx: ForwardContext): void {
    forwardContexts.set(req, ctx);
    sanitizeHeaders(req, ctx);
}
