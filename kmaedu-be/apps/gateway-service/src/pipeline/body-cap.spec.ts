import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'http';
import type { AddressInfo } from 'net';
import { PassThrough } from 'stream';
import { capRequestBody, isOverCap } from './body-cap';

const CAP = 64 * 1024;
let server: Server;
let received = 0;
let destroyedDest = false;
let seenReq: IncomingMessage | undefined;

beforeEach(async () => {
    received = 0;
    destroyedDest = false;
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
        seenReq = req;
        capRequestBody(req, res, CAP, 'req_cap');
        // Stand-in for http-proxy: pipe the request to the "upstream".
        const upstream = new PassThrough();
        upstream.on('data', (c: Buffer) => (received += c.length));
        upstream.on('close', () => (destroyedDest = upstream.destroyed));
        upstream.on('end', () => !res.headersSent && res.writeHead(200).end('ok'));
        req.pipe(upstream);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
});
afterEach(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
});

const post = (chunks: number, extraHeaders: Record<string, string> = {}) =>
    new Promise<{ status: number; body: string; reset: boolean }>((resolve) => {
        const port = (server.address() as AddressInfo).port;
        const req = request({ port, host: '127.0.0.1', method: 'POST', headers: { 'transfer-encoding': 'chunked', ...extraHeaders } }, (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => resolve({ status: res.statusCode!, body, reset: false }));
        });
        req.on('error', () => resolve({ status: 0, body: '', reset: true }));
        let i = 0;
        const pump = () => {
            while (i < chunks) {
                i++;
                if (!req.write(Buffer.alloc(16 * 1024, 1))) return void req.once('drain', pump);
            }
            req.end();
        };
        pump();
    });

describe('capRequestBody', () => {
    it('under the cap everything passes through intact', async () => {
        const res = await post(3); // 48KB
        expect(res).toEqual({ status: 200, body: 'ok', reset: false });
        expect(received).toBe(48 * 1024);
        expect(isOverCap(seenReq!)).toBe(false);
    });

    it('exactly at the cap still passes', async () => {
        expect((await post(4)).status).toBe(200); // 64KB
        expect(received).toBe(CAP);
    });

    it('over the cap: 413 envelope, never more than the cap reaches the upstream, which is destroyed', async () => {
        const res = await post(40); // 640KB
        expect(res.reset).toBe(false);
        expect(res.status).toBe(413);
        expect(JSON.parse(res.body)).toEqual({
            statusCode: 413,
            code: 'PAYLOAD_TOO_LARGE',
            message: expect.any(String),
            requestId: 'req_cap',
        });
        expect(received).toBeLessThanOrEqual(CAP);
        expect(isOverCap(seenReq!)).toBe(true);
        expect(destroyedDest).toBe(true);
    });

    it('delivers the 413 deterministically: 25 consecutive over-cap uploads, zero resets', async () => {
        const results: Array<{ status: number; reset: boolean }> = [];
        for (let i = 0; i < 25; i++) results.push(await post(60)); // ~1MB each
        expect(results.filter((r) => r.reset)).toHaveLength(0);
        expect(results.every((r) => r.status === 413)).toBe(true);
    });

    it('the connection is not poisoned: the same keep-alive agent serves a normal request afterwards', async () => {
        expect((await post(40)).status).toBe(413);
        expect((await post(2)).status).toBe(200);
    });
});
