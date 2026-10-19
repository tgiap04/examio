import { createHash } from 'crypto';
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'http';
import type { AddressInfo } from 'net';
import { compileRouteTable } from '../routing/route-table';
import { prepareProxiedRequest } from './prepare-request';
import { createRouteProxy, type RouteProxy } from './proxy-factory';
import type { ForwardContext } from './forward-headers';

const CTX: ForwardContext = {
    requestId: 'req_spec',
    mode: 'verified',
    token: 'jwt-spec',
    stripToken: false,
    ip: '10.1.2.3',
    proto: 'https',
    host: 'examio.top',
};

const listen = (server: Server) =>
    new Promise<string>((resolve) =>
        server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`))
    );

interface Rig {
    gateway: string;
    upstream: Server;
    seen: IncomingMessage[];
    close(): Promise<void>;
}

/** A real upstream, a real proxy built by the factory, and a tiny server standing in for the dispatcher. */
async function rig(options: {
    upstreamName: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void;
    timeout?: string;
    maxBodySize?: string;
    context?: ForwardContext | null;
    target?: string;
}): Promise<Rig> {
    const seen: IncomingMessage[] = [];
    const upstream = createServer((req, res) => {
        seen.push(req);
        options.handler(req, res);
    });
    const upstreamUrl = await listen(upstream);
    const table = compileRouteTable(
        {
            upstreams: { [options.upstreamName]: options.target ?? upstreamUrl },
            routes: [
                {
                    id: 'r',
                    upstream: options.upstreamName,
                    match: { prefix: '/api' },
                    auth: 'none',
                    ...(options.timeout ? { timeout: options.timeout } : {}),
                    ...(options.maxBodySize ? { maxBodySize: options.maxBodySize } : {}),
                },
            ],
            rateLimits: [],
        },
        {}
    );
    const proxy: RouteProxy = createRouteProxy(table.routes[0]);
    const gatewayServer = createServer((req, res) => {
        // What the dispatcher does before handing a request to the proxy.
        if (options.context !== null) {
            prepareProxiedRequest(req, res, { maxBodyBytes: table.routes[0].maxBodyBytes }, options.context ?? CTX);
        }
        void proxy(req, res, () => res.writeHead(500).end());
    });
    const gateway = await listen(gatewayServer);
    return {
        gateway,
        upstream,
        seen,
        close: async () => {
            gatewayServer.closeAllConnections();
            upstream.closeAllConnections();
            await Promise.all([gatewayServer, upstream].map((s) => new Promise((r) => s.close(r))));
        },
    };
}

const get = (url: string) =>
    new Promise<{ status: number; headers: IncomingMessage['headers']; raw: string[]; body: string }>((resolve, reject) => {
        request(url, (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, raw: res.headers['set-cookie'] ?? [], body }));
        })
            .on('error', reject)
            .end();
    });

describe('createRouteProxy', () => {
    const open: Rig[] = [];
    afterEach(async () => {
        await Promise.all(open.splice(0).map((r) => r.close()));
    });
    const make = async (o: Parameters<typeof rig>[0]) => {
        const r = await rig(o);
        open.push(r);
        return r;
    };

    it('rejects a route that has no upstream target (self routes are never proxied)', () => {
        const table = compileRouteTable(
            { upstreams: {}, routes: [{ id: 's', upstream: 'self', match: { prefix: '/x' }, auth: 'none' }], rateLimits: [] },
            {}
        );
        expect(() => createRouteProxy(table.routes[0])).toThrow(/no upstream target/);
    });

    it('relays status, headers and body and applies the forward context to the upstream request', async () => {
        const r = await make({
            upstreamName: 'exam',
            handler: (_q, res) => res.writeHead(201, { 'x-up': '1', 'content-type': 'text/plain' }).end('made'),
        });
        const res = await get(`${r.gateway}/api/thing?q=1`);
        expect(res.status).toBe(201);
        expect(res.headers['x-up']).toBe('1');
        expect(res.body).toBe('made');
        const seen = r.seen[0];
        expect(seen.url).toBe('/api/thing?q=1');
        expect(seen.headers.authorization).toBe('Bearer jwt-spec');
        expect(seen.headers['x-forwarded-for']).toBe('10.1.2.3');
        expect(seen.headers['x-request-id']).toBe('req_spec');
    });

    it('refuses to forward when the dispatcher left no context (a bypass), instead of forwarding unvetted headers', async () => {
        const r = await make({ upstreamName: 'exam', handler: (_q, res) => res.end('x'), context: null });
        const res = await get(`${r.gateway}/api/x`);
        expect(res.status).toBe(500);
        expect(JSON.parse(res.body)).toMatchObject({ code: 'INTERNAL_ERROR' });
        expect(r.seen).toHaveLength(0);
    });

    it('502 UPSTREAM_UNAVAILABLE envelope when the upstream refuses the connection', async () => {
        const dead = createServer();
        const deadUrl = await listen(dead);
        await new Promise((r) => dead.close(r));
        const r = await make({ upstreamName: 'exam', handler: () => undefined, target: deadUrl });
        const res = await get(`${r.gateway}/api/x`);
        expect(res.status).toBe(502);
        expect(JSON.parse(res.body)).toEqual({
            statusCode: 502,
            code: 'UPSTREAM_UNAVAILABLE',
            message: expect.any(String),
            requestId: 'req_spec',
        });
    });

    it('504 UPSTREAM_TIMEOUT when the upstream does not answer within the route timeout', async () => {
        const r = await make({ upstreamName: 'exam', handler: () => undefined, timeout: '150ms' });
        const res = await get(`${r.gateway}/api/slow`);
        expect(res.status).toBe(504);
        expect(JSON.parse(res.body)).toMatchObject({ code: 'UPSTREAM_TIMEOUT' });
    });

    it('cuts a stream that dies after its headers were sent (no second response)', async () => {
        const r = await make({
            upstreamName: 'exam',
            handler: (_q, res) => {
                res.writeHead(200, { 'content-type': 'text/event-stream' });
                res.write('data: one\n\n');
                setTimeout(() => res.destroy(), 50);
            },
        });
        const outcome = await new Promise<string>((resolve) => {
            request(`${r.gateway}/api/stream`, (res) => {
                res.on('data', () => undefined);
                res.on('end', () => resolve('ended'));
                res.on('error', () => resolve('cut'));
                res.on('close', () => resolve('cut'));
            })
                .on('error', () => resolve('cut'))
                .end();
        });
        // The upstream died mid-stream: the client must see the stream cut, never a clean second response.
        expect(outcome).toBe('cut');
    });

    describe('maxBodySize on streamed bytes (chunked bodies carry no Content-Length)', () => {
        const CAP = 100 * 1024;
        const chunk = (i: number) => Buffer.alloc(32 * 1024, i);

        /** POST `chunks` 32KB chunks with Transfer-Encoding: chunked. */
        const post = (url: string, chunks: number) =>
            new Promise<{ status: number; body: string }>((resolve) => {
                const req = request(url, { method: 'POST', headers: { 'transfer-encoding': 'chunked' } }, (res) => {
                    let body = '';
                    res.on('data', (c) => (body += c));
                    res.on('end', () => resolve({ status: res.statusCode!, body }));
                    res.on('close', () => resolve({ status: res.statusCode!, body }));
                });
                req.on('error', () => resolve({ status: 0, body: '' }));
                let i = 0;
                const pump = () => {
                    while (i < chunks) {
                        if (!req.write(chunk(i++))) return void req.once('drain', pump);
                    }
                    req.end();
                };
                pump();
            });

        const counting = () => {
            const state = { got: 0, hash: createHash('sha256') };
            const handler = (req: IncomingMessage, res: ServerResponse) => {
                req.on('data', (c: Buffer) => {
                    state.got += c.length;
                    state.hash.update(c);
                });
                req.on('end', () => res.writeHead(200).end('stored'));
                req.on('error', () => undefined);
            };
            return { state, handler };
        };

        it('over the cap: 413 PAYLOAD_TOO_LARGE envelope, and the upstream receives at most the cap', async () => {
            const { state, handler } = counting();
            const r = await make({ upstreamName: 'exam', handler, maxBodySize: '100kb' });
            const res = await post(`${r.gateway}/api/upload`, 10); // 320KB
            expect(res.status).toBe(413);
            expect(JSON.parse(res.body)).toEqual({
                statusCode: 413,
                code: 'PAYLOAD_TOO_LARGE',
                message: expect.any(String),
                requestId: 'req_spec',
            });
            await new Promise((resolve) => setTimeout(resolve, 100));
            expect(state.got).toBeLessThanOrEqual(CAP);
        });

        it('under the cap: the body passes through intact', async () => {
            const { state, handler } = counting();
            const r = await make({ upstreamName: 'exam', handler, maxBodySize: '100kb' });
            const res = await post(`${r.gateway}/api/upload`, 3); // 96KB
            expect(res).toEqual({ status: 200, body: 'stored' });
            const expected = createHash('sha256');
            for (let i = 0; i < 3; i++) expected.update(chunk(i));
            expect(state.got).toBe(96 * 1024);
            expect(state.hash.digest('hex')).toBe(expected.digest('hex'));
        });

        it('a route without a cap is not limited', async () => {
            const { state, handler } = counting();
            const r = await make({ upstreamName: 'exam', handler });
            expect((await post(`${r.gateway}/api/upload`, 10)).status).toBe(200);
            expect(state.got).toBe(320 * 1024);
        });
    });

    describe('Set-Cookie: auth is the only cookie issuer', () => {
        const cookies = ['accessToken=a; Path=/; HttpOnly', 'theme=dark'];
        const handler = (_q: IncomingMessage, res: ServerResponse) =>
            res.writeHead(200, { 'set-cookie': cookies }).end('ok');

        it.each(['exam', 'finance', 'admin'])('drops %s upstream cookies before they reach the client', async (upstreamName) => {
            const r = await make({ upstreamName, handler });
            const res = await get(`${r.gateway}/api/x`);
            expect(res.status).toBe(200);
            expect(res.raw).toEqual([]);
        });

        it('keeps every auth upstream cookie, verbatim', async () => {
            const r = await make({ upstreamName: 'auth', handler });
            expect((await get(`${r.gateway}/api/x`)).raw).toEqual(cookies);
        });
    });
});
