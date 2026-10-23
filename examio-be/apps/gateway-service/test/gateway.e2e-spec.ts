import { bootGateway, type Harness } from './support/boot-gateway';
import { RUN } from './support/tokens';

/**
 * Proxy behaviour: pass-through fidelity, header hygiene, error envelope,
 * self-served routes, request log. Needs Redis (REDIS_HOST/PORT) and RabbitMQ (RABBITMQ_URL, gateway user).
 */
describe('gateway proxy (e2e)', () => {
    let h: Harness;
    // Distinct, per-run client addresses keep rate-limit buckets independent.
    const ip = (n: number) => `10.${(Number.parseInt(RUN, 36) % 200) + 20}.${n}.7`;
    const via = (n: number) => ({ 'x-forwarded-for': `203.0.113.250, ${ip(n)}` });

    beforeAll(async () => {
        h = await bootGateway();
    }, 60_000);
    afterAll(() => h?.close());
    beforeEach(() => {
        for (const u of [h.exam, h.vocabulary, h.auth, h.finance, h.admin]) u.reset();
    });

    it('passes status, headers and BOTH Set-Cookie headers through verbatim', async () => {
        h.auth.handler = (_req, res) => {
            res.writeHead(201, {
                'content-type': 'application/json',
                'x-upstream': 'auth',
                'set-cookie': [
                    'accessToken=a; Path=/; HttpOnly; SameSite=Lax',
                    'refreshToken=r; Path=/api/v1/auth; HttpOnly; SameSite=Lax',
                ],
            });
            res.end('{"created":true}');
        };
        const res = await fetch(`${h.baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...via(1) },
            body: '{"email":"a@b.c"}',
        });
        expect(res.status).toBe(201);
        expect(res.headers.get('x-upstream')).toBe('auth');
        expect(res.headers.getSetCookie()).toEqual([
            'accessToken=a; Path=/; HttpOnly; SameSite=Lax',
            'refreshToken=r; Path=/api/v1/auth; HttpOnly; SameSite=Lax',
        ]);
        expect(await res.json()).toEqual({ created: true });
        // auth: none routes keep the client's own credentials untouched
        expect(h.auth.seen[0].bytes).toBe('{"email":"a@b.c"}'.length);
    });

    it('a Set-Cookie from any non-auth upstream never reaches the client (auth is the only cookie issuer)', async () => {
        const plant = (_req: unknown, res: import('http').ServerResponse) =>
            void res.writeHead(200, { 'set-cookie': ['accessToken=evil; Path=/', 'x=1'] }).end('{}');
        h.exam.handler = plant;
        h.finance.handler = plant;
        h.admin.handler = plant;
        const teacher = await h.issuer.user('cookies', ['TEACHER', 'SYSTEM_ADMIN']);
        const auth = { authorization: `Bearer ${teacher}`, ...via(12) };
        for (const path of ['/api/v1/quizsets', '/api/v1/wallet/details', '/api/v1/admin/users']) {
            const res = await fetch(`${h.baseUrl}${path}`, { headers: auth });
            expect({ path, status: res.status, cookies: res.headers.getSetCookie() }).toEqual({
                path,
                status: 200,
                cookies: [],
            });
        }
    });

    it('relays upstream 4xx/5xx bodies and statuses unchanged', async () => {
        h.exam.handler = (_req, res) =>
            res.writeHead(422, { 'content-type': 'application/json' }).end('{"code":"X","message":"m"}');
        const token = await h.issuer.user('teach', ['TEACHER']);
        const res = await fetch(`${h.baseUrl}/api/v1/quizsets`, {
            headers: { authorization: `Bearer ${token}` },
        });
        expect(res.status).toBe(422);
        expect(await res.json()).toEqual({ code: 'X', message: 'm' });
    });

    it('strips inbound x-user-* and rewrites forwarding headers (one client IP, never appended)', async () => {
        const token = await h.issuer.user('hdr', ['TEACHER']);
        await fetch(`${h.baseUrl}/api/v1/quizsets`, {
            headers: {
                authorization: `Bearer ${token}`,
                'x-user-roles': 'SYSTEM_ADMIN',
                'x-user-id': 'someone-else',
                'x-forwarded-host': 'evil.example',
                'x-request-id': 'req_e2e-hdr',
                ...via(5),
            },
        });
        const seen = h.exam.seen[0].headers;
        expect(seen['x-user-roles']).toBeUndefined();
        expect(seen['x-user-id']).toBeUndefined();
        expect(seen.authorization).toBe(`Bearer ${token}`);
        expect(seen['x-forwarded-for']).toBe(ip(5));
        expect(seen['x-request-id']).toBe('req_e2e-hdr');
        expect(seen['x-forwarded-host']).not.toBe('evil.example');
    });

    it('word-family goes to vocabulary, but POST :id/to-flashcard goes to exam (path beats prefix)', async () => {
        const token = await h.issuer.user('wf', ['TEACHER']);
        const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...via(6) };
        await fetch(`${h.baseUrl}/api/v1/word-family/categories`, { headers });
        await fetch(`${h.baseUrl}/api/v1/word-family/wf_1/to-flashcard`, { method: 'POST', headers, body: '{}' });
        expect(h.vocabulary.seen.map((r) => r.url)).toEqual(['/api/v1/word-family/categories']);
        expect(h.exam.seen.map((r) => r.url)).toEqual(['/api/v1/word-family/wf_1/to-flashcard']);
    });

    it('moves a cookie token into an Authorization header for the upstream', async () => {
        const token = await h.issuer.user('cookie', ['TEACHER']);
        await fetch(`${h.baseUrl}/api/v1/quizsets`, {
            headers: { cookie: `accessToken=${token}; theme=dark` },
        });
        expect(h.exam.seen[0].headers.authorization).toBe(`Bearer ${token}`);
    });

    it('answers with the error envelope and the same request id in the header', async () => {
        const res = await fetch(`${h.baseUrl}/api/v1/nope`, { headers: via(6) });
        const body = await res.json();
        expect(res.status).toBe(404);
        expect(body).toEqual({
            statusCode: 404,
            code: 'ROUTE_NOT_FOUND',
            message: expect.any(String),
            requestId: res.headers.get('x-request-id'),
        });
        const unauth = await fetch(`${h.baseUrl}/api/v1/quizsets`);
        expect(await unauth.json()).toMatchObject({ statusCode: 401, code: 'TOKEN_MISSING' });
    });

    it('502 UPSTREAM_UNAVAILABLE when the upstream is down', async () => {
        await h.finance.stop();
        const token = await h.issuer.user('wal', ['TEACHER']);
        const res = await fetch(`${h.baseUrl}/api/v1/wallet/details`, {
            headers: { authorization: `Bearer ${token}` },
        });
        expect(res.status).toBe(502);
        expect(await res.json()).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
        await h.finance.start();
    });

    it('serves /health, /status and /config/pages itself and sets no cookies', async () => {
        expect((await fetch(`${h.baseUrl}/health/live`)).status).toBe(200);
        const status = await fetch(`${h.baseUrl}/api/v1/status`, { headers: via(7) });
        expect(status.status).toBe(200);
        expect(status.headers.getSetCookie()).toEqual([]);
        const pages = await fetch(`${h.baseUrl}/api/v1/config/pages`, { headers: via(8) });
        expect(pages.status).toBe(200);
        expect(await pages.json()).toEqual({ pages: expect.any(Array) });
        const stream = await fetch(`${h.baseUrl}/api/v1/config/stream`, { headers: via(9) });
        expect(stream.status).toBe(401);
    });

    it('SePay webhook keeps its Apikey authorization and is rewritten to /api/v1/webhook', async () => {
        await fetch(`${h.baseUrl}/api/v1/webhook/sepay`, {
            method: 'POST',
            headers: { authorization: 'Apikey secret-key', 'content-type': 'application/json', ...via(10) },
            body: '{}',
        });
        expect(h.finance.seen[0].url).toBe('/api/v1/webhook');
        expect(h.finance.seen[0].headers.authorization).toBe('Apikey secret-key');
    });

    it('appends one redacted line to Redis logs:gateway per proxied request', async () => {
        const { default: Redis } = await import('ioredis');
        const redis = new Redis({
            host: process.env.REDIS_HOST,
            port: Number(process.env.REDIS_PORT),
        });
        try {
            const marker = `/api/v1/subjects/slug/log-${RUN}`;
            await fetch(`${h.baseUrl}${marker}?token=SECRET-VALUE&code=abc`, { headers: via(11) });
            let mine: { line: string; redacted: string }[] = [];
            for (let i = 0; i < 20 && mine.length === 0; i++) {
                await new Promise((r) => setTimeout(r, 100));
                const entries = (await redis.lrange('logs:gateway', 0, 200)).map((e) => JSON.parse(e));
                mine = entries.filter((e) => e.line.includes(marker));
            }
            expect(mine).toHaveLength(1);
            expect(mine[0].redacted).toMatch(new RegExp(`→ GET ${marker} 200 \\d+ms`));
            expect(mine[0].redacted).not.toContain('SECRET-VALUE');
        } finally {
            redis.disconnect();
        }
    });
});
