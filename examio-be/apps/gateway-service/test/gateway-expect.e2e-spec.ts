import { request as httpRequest, type IncomingHttpHeaders } from 'http';
import { bootGateway, type Harness } from './support/boot-gateway';
import { RUN } from './support/tokens';

/**
 * http-proxy skips its `proxyReq` event when the outgoing request carries an
 * `Expect` header, so anything done in that hook is bypassed by `Expect:
 * 100-continue` (curl adds it above 1MB). Every guarantee below must hold with
 * AND without it.
 */
describe.each([
    ['without Expect', false],
    ['with Expect: 100-continue', true],
])('gateway request hygiene %s (e2e)', (_name, withExpect) => {
    let h: Harness;
    let n = 0;
    const ip = () => `10.${(Number.parseInt(RUN, 36) % 200) + 20}.${withExpect ? 50 : 60}.${++n}`;

    beforeAll(async () => {
        h = await bootGateway();
    }, 60_000);
    afterAll(() => h?.close());
    beforeEach(() => {
        for (const u of [h.content, h.assessment, h.document, h.aichat, h.auth, h.finance, h.admin]) u.reset();
    });

    interface Sent {
        status: number;
        body: string;
        reset: boolean;
    }
    const send = (
        path: string,
        options: { method?: string; headers?: Record<string, string>; chunks?: number; chunkBytes?: number } = {}
    ) =>
        new Promise<Sent>((resolve) => {
            const { chunks = 0, chunkBytes = 64 * 1024 } = options;
            const headers: Record<string, string> = { 'x-forwarded-for': `203.0.113.7, ${ip()}`, ...options.headers };
            if (withExpect) headers.expect = '100-continue';
            if (chunks > 0) headers['transfer-encoding'] = 'chunked';
            const req = httpRequest(`${h.baseUrl}${path}`, { method: options.method ?? 'GET', headers }, (res) => {
                let body = '';
                res.on('data', (c) => (body += c));
                res.on('end', () => resolve({ status: res.statusCode ?? 0, body, reset: false }));
            });
            req.on('error', () => resolve({ status: 0, body: '', reset: true }));
            let i = 0;
            const pump = () => {
                while (i < chunks) {
                    i++;
                    if (!req.write(Buffer.alloc(chunkBytes, 3))) return void req.once('drain', pump);
                }
                req.end();
            };
            // Node only sends the body after `continue` when Expect is set; both orders are valid.
            if (withExpect && chunks > 0) req.once('continue', pump);
            else pump();
        });

    const upstreamHeaders = (): IncomingHttpHeaders => h.content.seen[0].headers;

    it('(a) spoofed identity headers never reach the upstream', async () => {
        const token = await h.issuer.user(`spoof${withExpect}`, ['STUDENT']);
        const res = await send('/api/v1/quizsets', {
            headers: {
                authorization: `Bearer ${token}`,
                'x-user-roles': 'SYSTEM_ADMIN',
                'x-user-id': 'admin-1',
                'x-user-email': 'a@b.c',
            },
        });
        expect(res.status).toBe(200);
        const seen = upstreamHeaders();
        expect(seen['x-user-roles']).toBeUndefined();
        expect(seen['x-user-id']).toBeUndefined();
        expect(seen['x-user-email']).toBeUndefined();
        expect(seen.expect).toBeUndefined();
    });

    it('(b) a spoofed X-Forwarded-For / X-Real-IP / X-Forwarded-Host is overwritten', async () => {
        const token = await h.issuer.user(`xff${withExpect}`, ['STUDENT']);
        const client = ip();
        await send('/api/v1/quizsets', {
            headers: {
                authorization: `Bearer ${token}`,
                'x-forwarded-for': `6.6.6.6, ${client}`,
                'x-real-ip': '6.6.6.6',
                'x-forwarded-host': 'evil.example',
                forwarded: 'for=6.6.6.6',
                'x-request-id': 'req_e2e-expect',
            },
        });
        const seen = upstreamHeaders();
        expect(seen['x-forwarded-for']).toBe(client);
        expect(seen['x-real-ip']).toBe(client);
        expect(seen['x-forwarded-host']).not.toBe('evil.example');
        expect(seen.forwarded).toBeUndefined();
        expect(seen['x-request-id']).toBe('req_e2e-expect');
    });

    it('(c) the token from the accessToken cookie is still injected as Authorization', async () => {
        const token = await h.issuer.user(`cookie${withExpect}`, ['STUDENT']);
        const res = await send('/api/v1/quizsets', { headers: { cookie: `accessToken=${token}; theme=dark` } });
        expect(res.status).toBe(200);
        expect(upstreamHeaders().authorization).toBe(`Bearer ${token}`);
    });

    it('(c2) a client-sent Authorization on an optional route with a revoked cookie is stripped', async () => {
        const res = await send('/api/v1/subjects', { headers: { authorization: 'Bearer garbage', cookie: 'accessToken=garbage; theme=dark' } });
        expect(res.status).toBe(200);
        // /subjects is served by ai-chat-service
        expect(h.aichat.seen[0].headers.authorization).toBeUndefined();
        expect(h.aichat.seen[0].headers.cookie).toBe('theme=dark');
    });

    describe('(d) maxBodySize on a chunked body (r2-image caps at 3mb)', () => {
        const cap = 3 * 1024 * 1024;
        const echoOnEnd = (req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
            req.on('end', () => void res.writeHead(200).end('{"stored":true}'));
            req.on('error', () => undefined);
        };

        it('over the cap: 413 envelope and the upstream receives at most the cap', async () => {
            h.document.handler = echoOnEnd;
            const token = await h.issuer.user(`cap${withExpect}`, ['TEACHER']);
            const res = await send('/api/v1/r2/image', { method: 'POST', headers: { authorization: `Bearer ${token}` }, chunks: 80 }); // 5MB
            expect(res.reset).toBe(false);
            expect(res.status).toBe(413);
            expect(JSON.parse(res.body)).toMatchObject({ statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
            await new Promise((r) => setTimeout(r, 200));
            expect(h.document.seen[0].bytes).toBeLessThanOrEqual(cap);
        });

        it('under the cap: passes, byte count intact', async () => {
            h.document.handler = echoOnEnd;
            const token = await h.issuer.user(`under${withExpect}`, ['TEACHER']);
            const res = await send('/api/v1/r2/image', { method: 'POST', headers: { authorization: `Bearer ${token}` }, chunks: 32 }); // 2MB
            expect(res.status).toBe(200);
            expect(h.document.seen[0].bytes).toBe(32 * 64 * 1024);
        });

        it('the 413 is delivered deterministically: 20 consecutive over-cap uploads, zero resets', async () => {
            h.document.handler = echoOnEnd;
            const token = await h.issuer.user(`twenty${withExpect}`, ['TEACHER', 'SYSTEM_ADMIN']);
            const results: Sent[] = [];
            for (let i = 0; i < 20; i++) {
                results.push(await send('/api/v1/r2/image', { method: 'POST', headers: { authorization: `Bearer ${token}` }, chunks: 80 }));
            }
            expect(results.filter((r) => r.reset)).toHaveLength(0);
            expect(results.map((r) => r.status)).toEqual(Array(20).fill(413));
        }, 60_000);
    });
});
