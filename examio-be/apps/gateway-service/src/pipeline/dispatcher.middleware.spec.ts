import { Agent, createServer, request, type IncomingMessage, type Server } from 'http';
import { connect, type AddressInfo } from 'net';
import { compileRouteTable } from '../routing/route-table';
import { contentLengthOf, createDispatcher, pathnameOf } from './dispatcher.middleware';
import { trustHops } from './client-ip';
import { forwardContexts } from './proxy-factory';
import type { Decision } from './guard-chain';

const table = compileRouteTable(
    {
        upstreams: { exam: 'http://exam' },
        routes: [
            { id: 'quiz', upstream: 'exam', match: { prefix: '/api/v1/quizsets' }, auth: 'required' },
            { id: 'status', upstream: 'self', match: { path: '/api/v1/status' }, auth: 'none' },
        ],
        rateLimits: [],
    },
    {}
);

const OK: Decision = { ok: true, mode: 'verified', token: 'tok', stripToken: false };

let lastReq: IncomingMessage | undefined;

async function rig(decide: (input: { pathname: string }) => Decision | Promise<Decision>) {
    const chain = { run: jest.fn(async (input: { pathname: string }) => decide(input)) };
    const proxy = jest.fn((req, res, next: (e?: unknown) => void) => {
        void req;
        void next;
        res.writeHead(200).end('proxied');
    });
    const log = { attach: jest.fn() };
    const next = jest.fn((_err?: unknown) => undefined);
    const dispatcher = createDispatcher({
        table,
        chain: chain as never,
        proxies: new Map([['quiz', proxy]]),
        trust: trustHops(1),
        log,
    });
    const server: Server = createServer((req, res) => {
        lastReq = req;
        dispatcher(req as never, res as never, (e?: unknown) => {
            next(e);
            res.writeHead(204).end();
        });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const call = (path: string, headers: Record<string, string> = {}) =>
        new Promise<{ status: number; headers: Record<string, unknown>; body: string }>((resolve, reject) => {
            // No pooled sockets: a pooled one to a previous test's server on a reused port gives EPIPE.
            request(base + path, { headers, agent: false }, (res) => {
                let body = '';
                res.on('data', (c) => (body += c));
                res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
            })
                .on('error', reject)
                .end();
        });
    const port = (server.address() as AddressInfo).port;
    return { chain, proxy, log, next, call, port, lastReq: () => lastReq, close: () => new Promise((r) => (server.closeAllConnections(), server.close(r))) };
}

describe('pathnameOf / contentLengthOf', () => {
    it('drops the query string', () => {
        expect(pathnameOf('/a/b?x=1&y=2')).toBe('/a/b');
        expect(pathnameOf('/a/b')).toBe('/a/b');
        expect(pathnameOf(undefined)).toBe('/');
    });

    it('reads a valid content-length only', () => {
        const len = (v?: string) => contentLengthOf({ headers: v === undefined ? {} : { 'content-length': v } } as never);
        expect(len('42')).toBe(42);
        expect(len('0')).toBe(0);
        expect(len()).toBeUndefined();
        expect(len('abc')).toBeUndefined();
        expect(len('-5')).toBeUndefined();
    });
});

describe('dispatcher middleware', () => {
    let r: Awaited<ReturnType<typeof rig>>;
    afterEach(() => r?.close());

    it('lets /health/* fall through untouched (no id, no log, no checks)', async () => {
        r = await rig(() => OK);
        expect((await r.call('/health/live')).status).toBe(204);
        expect(r.next).toHaveBeenCalledTimes(1);
        expect(r.chain.run).not.toHaveBeenCalled();
        expect(r.log.attach).not.toHaveBeenCalled();
    });

    it('404 ROUTE_NOT_FOUND envelope; the request id is reused from a well-formed header and echoed', async () => {
        r = await rig(() => OK);
        const res = await r.call('/nope', { 'x-request-id': 'req_given-1' });
        expect(res.status).toBe(404);
        expect(res.headers['x-request-id']).toBe('req_given-1');
        expect(JSON.parse(res.body)).toEqual({
            statusCode: 404,
            code: 'ROUTE_NOT_FOUND',
            message: expect.any(String),
            requestId: 'req_given-1',
        });
        expect(r.log.attach).toHaveBeenCalledTimes(1);
        expect(r.chain.run).not.toHaveBeenCalled();
    });

    it('mints a request id when the header is missing or hostile', async () => {
        r = await rig(() => OK);
        const res = await r.call('/nope', { 'x-request-id': 'bad id with spaces' });
        expect(res.headers['x-request-id']).toMatch(/^req_/);
    });

    it('a denied request is answered with its status, code and Retry-After, and is never proxied', async () => {
        r = await rig(() => ({ ok: false, status: 429, code: 'RATE_LIMITED', retryAfterSec: 9 }));
        const res = await r.call('/api/v1/quizsets');
        expect(res.status).toBe(429);
        expect(res.headers['retry-after']).toBe('9');
        expect(JSON.parse(res.body)).toMatchObject({ code: 'RATE_LIMITED' });
        expect(r.proxy).not.toHaveBeenCalled();
    });

    it('413 from a declared Content-Length: the 413 arrives, the unread body is drained within a bound (8MB), then the socket is closed', async () => {
        r = await rig(() => ({ ok: false, status: 413, code: 'PAYLOAD_TOO_LARGE' }));
        // A raw client that ignores the early response and keeps sending the declared 50MB.
        const outcome = await new Promise<{ response: string; sent: number; closedByServer: boolean }>((resolve) => {
            const socket = connect(r.port, '127.0.0.1');
            let response = '';
            let sent = 0;
            let done = false;
            const finish = (closedByServer: boolean) => {
                if (done) return;
                done = true;
                socket.destroy();
                resolve({ response, sent, closedByServer });
            };
            socket.on('data', (d) => (response += d.toString()));
            socket.on('error', () => finish(true));
            socket.on('close', () => finish(true));
            socket.write(
                `POST /api/v1/quizsets HTTP/1.1\r\nHost: x\r\nContent-Length: ${50 * 1024 * 1024}\r\n\r\n`
            );
            const chunk = Buffer.alloc(1024 * 1024, 1);
            const pump = () => {
                if (done) return;
                if (sent >= 50 * 1024 * 1024) return void setTimeout(() => finish(false), 500);
                sent += chunk.length;
                if (socket.write(chunk)) setImmediate(pump);
                else socket.once('drain', pump);
            };
            pump();
        });
        expect(outcome.response).toMatch(/^HTTP\/1\.1 413 /);
        expect(outcome.response).toContain('PAYLOAD_TOO_LARGE');
        expect(outcome.closedByServer).toBe(true);
        // Drained up to the bound (8MB), cut well before the declared 50MB.
        expect(outcome.sent).toBeGreaterThanOrEqual(8 * 1024 * 1024);
        expect(outcome.sent).toBeLessThan(30 * 1024 * 1024);
    });

    it('a small declared body that is within the drain bound is read to the end and the connection stays usable', async () => {
        r = await rig(() => ({ ok: false, status: 413, code: 'PAYLOAD_TOO_LARGE' }));
        const agent = new Agent({ keepAlive: true, maxSockets: 1 });
        const send = () =>
            new Promise<number>((resolve) => {
                const req = request({ agent, port: r.port, host: '127.0.0.1', path: '/api/v1/quizsets', method: 'POST', headers: { 'content-length': '1048576' } }, (res) => {
                    res.resume();
                    res.on('end', () => resolve(res.statusCode!));
                });
                req.on('error', () => resolve(0));
                req.end(Buffer.alloc(1048576, 2));
            });
        expect([await send(), await send(), await send()]).toEqual([413, 413, 413]);
        agent.destroy();
    });

    it('a denial without a retry hint has no Retry-After', async () => {
        r = await rig(() => ({ ok: false, status: 403, code: 'PERMISSION_DENIED' }));
        expect((await r.call('/api/v1/quizsets')).headers['retry-after']).toBeUndefined();
    });

    it('passes the chain the method, pathname, headers, client ip (last XFF entry) and content length', async () => {
        r = await rig(() => OK);
        await r.call('/api/v1/quizsets?x=1', { 'x-forwarded-for': '6.6.6.6, 10.0.0.9', 'content-length': '0' });
        expect(r.chain.run).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'GET',
                pathname: '/api/v1/quizsets',
                ip: '10.0.0.9',
                contentLength: 0,
                route: expect.objectContaining({ id: 'quiz' }),
            })
        );
    });

    it('sets the forward context and streams through the route proxy when allowed', async () => {
        r = await rig(() => ({ ok: true, mode: 'verified', token: 'tok-1', stripToken: false }));
        const res = await r.call('/api/v1/quizsets', { host: 'examio.top', 'x-forwarded-proto': 'https' });
        expect(res.body).toBe('proxied');
        expect(r.proxy).toHaveBeenCalledTimes(1);
        const req = r.proxy.mock.calls[0][0];
        expect(forwardContexts.get(req)).toMatchObject({
            mode: 'verified',
            token: 'tok-1',
            stripToken: false,
            proto: 'https',
            host: 'examio.top',
            requestId: expect.stringMatching(/^req_/),
        });
    });

    it('a self-served route falls through to Nest after the checks, without proxying', async () => {
        r = await rig(() => OK);
        expect((await r.call('/api/v1/status')).status).toBe(204);
        expect(r.chain.run).toHaveBeenCalledTimes(1);
        expect(r.proxy).not.toHaveBeenCalled();
    });

    it('a proxy that reports an error through next() becomes a 502 envelope', async () => {
        r = await rig(() => OK);
        r.proxy.mockImplementationOnce((_req, _res, next) => next(new Error('boom')));
        const res = await r.call('/api/v1/quizsets');
        expect(res.status).toBe(502);
        expect(JSON.parse(res.body)).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    });

    it('an unexpected failure in the chain is a 500 INTERNAL_ERROR, never a hung request or a leaked message', async () => {
        r = await rig(() => Promise.reject(new Error('redis password is hunter2')));
        const res = await r.call('/api/v1/quizsets');
        expect(res.status).toBe(500);
        expect(JSON.parse(res.body)).toMatchObject({ code: 'INTERNAL_ERROR' });
        expect(res.body).not.toContain('hunter2');
    });
});
