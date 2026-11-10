import type { IncomingMessage, ServerResponse } from 'http';
import { Transform, type Writable } from 'stream';
import { sendError } from './error-response';

/** Requests already answered with 413: the upstream error that follows is expected, not a 502. */
const overCap = new WeakSet<IncomingMessage>();
export const isOverCap = (req: IncomingMessage): boolean => overCap.has(req);

const DRAIN_EXTRA_BYTES = 8 * 1024 * 1024;
const DRAIN_MAX_MS = 5_000;

/**
 * After an early response (413) the client may still be sending. Closing a
 * socket with unread request bytes makes the OS reset the connection, which can
 * wipe the response before the client reads it, so read and drop the rest,
 * bounded by bytes and time; only a client past the bound is cut.
 */
export function drainRequest(req: IncomingMessage, alreadyRead = 0): void {
    let total = alreadyRead;
    const timer = setTimeout(() => req.destroy(), DRAIN_MAX_MS);
    timer.unref();
    req.once('close', () => clearTimeout(timer));
    req.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > alreadyRead + DRAIN_EXTRA_BYTES) req.destroy();
    });
    req.resume();
}

/**
 * `maxBodySize` on the bytes actually streamed (a chunked body has no
 * Content-Length for the guard chain to check).
 *
 * Attached to the INCOMING request, independent of any proxy event: http-proxy
 * calls `req.pipe(proxyReq)` exactly once, and that call is routed through a
 * counting Transform. Nothing is buffered; chunks flow on untouched until the
 * total passes the cap. Then:
 *   - the upstream request is destroyed, so it received at most `cap` bytes;
 *   - the 413 envelope is written and ended at once (keep-alive stays on:
 *     `Connection: close` would make Node reset a socket that still has unread
 *     request bytes, which can wipe the 413 before the client reads it);
 *   - the rest of the body is read and dropped, bounded by bytes and time, and
 *     the socket is only destroyed if the client exceeds that bound.
 */
export function capRequestBody(
    req: IncomingMessage,
    res: ServerResponse,
    cap: number,
    requestId: string
): void {
    let total = 0;
    let upstream: Writable | undefined;

    const abandon = () => req.destroy();
    const trip = () => {
        overCap.add(req);
        if (upstream) {
            counter.unpipe(upstream);
            upstream.destroy();
        }
        sendError(res, 413, 'PAYLOAD_TOO_LARGE', requestId);
        const timer = setTimeout(abandon, DRAIN_MAX_MS);
        timer.unref();
        req.once('close', () => clearTimeout(timer));
    };

    const counter = new Transform({
        transform(chunk: Buffer, _encoding, done) {
            total += chunk.length;
            if (total <= cap) return done(null, chunk);
            if (!overCap.has(req)) trip();
            if (total > cap + DRAIN_EXTRA_BYTES) abandon();
            done(); // dropped
        },
    });

    const originalPipe = req.pipe.bind(req) as (dest: Writable, options?: { end?: boolean }) => Writable;
    req.pipe = (<T extends NodeJS.WritableStream>(dest: T, options?: { end?: boolean }): T => {
        upstream = dest as unknown as Writable;
        originalPipe(counter);
        counter.pipe(dest, options);
        return dest;
    }) as typeof req.pipe;
}
