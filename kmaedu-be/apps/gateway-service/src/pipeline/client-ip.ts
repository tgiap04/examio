import type { IncomingMessage } from 'http';
import * as proxyaddr from 'proxy-addr';

/** `(address, hopIndex)`; hop 0 is the direct peer. Same shape Express compiles from `trust proxy`. */
export type TrustFn = (address: string, hop: number) => boolean;

/** Trust the first `hops` addresses nearest to us (the nginx in front of the gateway). */
export function trustHops(hops: number): TrustFn {
    return (_address, hop) => hop < hops;
}

const MAPPED_IPV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/**
 * The real client address: walk `X-Forwarded-For` from the right, skipping the
 * trusted hops. Used by the HTTP limiter key and by raw WebSocket upgrades
 * (which have no `req.ip`), so a forged leftmost entry never changes the key.
 */
export function clientIp(req: IncomingMessage, trust: TrustFn): string {
    const raw = proxyaddr(req, trust);
    if (!raw) return 'unknown';
    return MAPPED_IPV4.exec(raw)?.[1] ?? raw;
}

/** First element of a comma-separated header (`https, http` -> `https`). */
function first(value: string | string[] | undefined): string | undefined {
    const text = Array.isArray(value) ? value[0] : value;
    if (!text) return undefined;
    const comma = text.indexOf(',');
    return (comma === -1 ? text : text.slice(0, comma)).trim() || undefined;
}

export function forwardedProto(req: IncomingMessage): 'http' | 'https' {
    return first(req.headers['x-forwarded-proto']) === 'https' ? 'https' : 'http';
}

/**
 * nginx forwards the public host in `Host` (`proxy_set_header Host $host`) and
 * does not sanitise `X-Forwarded-Host`, so a client-supplied one is ignored.
 */
export function forwardedHost(req: IncomingMessage): string | undefined {
    return first(req.headers.host);
}
