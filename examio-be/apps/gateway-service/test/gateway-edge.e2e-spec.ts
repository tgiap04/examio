import { WebSocket } from 'ws';
import { bootGateway, type Harness } from './support/boot-gateway';
import { RUN } from './support/tokens';
import { alignToWindow } from './support/windows';

const ip = (n: number) => `10.${(Number.parseInt(RUN, 36) % 200) + 20}.${n}.9`;
const via = (n: number) => ({ 'x-forwarded-for': `203.0.113.252, ${ip(n)}` });

/** Edge hardening: CORS, real client IP and per-route limits, authenticated WebSocket upgrade. */
describe('gateway edge (e2e)', () => {
    let h: Harness;
    beforeAll(async () => {
        h = await bootGateway();
    }, 60_000);
    afterAll(() => h?.close());
    beforeEach(() => {
        for (const u of [h.content, h.assessment, h.studyroom, h.vocabulary, h.document, h.aichat, h.auth, h.finance, h.admin]) u.reset();
    });

    describe('CORS', () => {
        it('answers an allowed-origin preflight with 204 and CORS headers, upstream untouched', async () => {
            const res = await fetch(`${h.baseUrl}/api/v1/quizsets`, {
                method: 'OPTIONS',
                headers: {
                    origin: 'https://allowed.example',
                    'access-control-request-method': 'POST',
                    'access-control-request-headers': 'authorization,x-device-id',
                },
            });
            expect(res.status).toBe(204);
            expect(res.headers.get('access-control-allow-origin')).toBe('https://allowed.example');
            expect(res.headers.get('access-control-allow-credentials')).toBe('true');
            expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('x-device-id');
            expect(h.content.seen).toHaveLength(0);
        });

        it('gives a disallowed origin no Access-Control-Allow-Origin', async () => {
            const res = await fetch(`${h.baseUrl}/api/v1/quizsets`, {
                method: 'OPTIONS',
                headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
            });
            expect(res.headers.get('access-control-allow-origin')).toBeNull();
            expect(h.content.seen).toHaveLength(0);
        });

        it('sets security headers (helmet)', async () => {
            const res = await fetch(`${h.baseUrl}/api/v1/status`, { headers: via(1) });
            expect(res.headers.get('x-content-type-options')).toBe('nosniff');
            expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
        });
    });

    describe('real client IP and limits (RT-15)', () => {
        it('six logins with forged leftmost X-Forwarded-For still hit one bucket: the 6th is 429', async () => {
            await alignToWindow(60_000, 5_000);
            const statuses: number[] = [];
            for (let i = 0; i < 6; i++) {
                const res = await fetch(`${h.baseUrl}/api/v1/auth/login`, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        // a different "client" every time, the same trusted-hop value
                        'x-forwarded-for': `198.51.100.${i + 1}, ${ip(2)}`,
                    },
                    body: '{}',
                });
                statuses.push(res.status);
                if (res.status === 429) {
                    expect(Number(res.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
                    expect(await res.json()).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
                }
            }
            expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
            // The upstream only ever sees the single client address, not the forged chain.
            expect(h.auth.seen.map((s) => s.headers['x-forwarded-for'])).toEqual(Array(5).fill(ip(2)));
        });

        it('an authenticated caller is limited by user id, not by address', async () => {
            const token = await h.issuer.user('ratelimited', ['TEACHER']);
            const hit = (n: number) =>
                fetch(`${h.baseUrl}/api/v1/ai/quick-upload`, {
                    method: 'POST',
                    headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': `1.1.1.1, ${ip(n)}` },
                    body: 'x',
                });
            await alignToWindow(60_000, 5_000);
            for (let i = 0; i < 10; i++) expect((await hit(10 + i)).status).toBe(200);
            expect((await hit(40)).status).toBe(429);
        });
    });

    describe('WebSocket upgrade', () => {
        const wsUrl = () => `${h.baseUrl.replace('http', 'ws')}/ws/study/socket.io/?EIO=4&transport=websocket`;
        const open = (headers: Record<string, string>) =>
            new Promise<{ opened: boolean; status?: number; message?: string }>((resolve) => {
                const ws = new WebSocket(wsUrl(), { headers });
                ws.once('message', (m) => {
                    ws.close();
                    resolve({ opened: true, message: m.toString() });
                });
                ws.once('unexpected-response', (_req, res) => {
                    resolve({ opened: false, status: res.statusCode });
                    ws.terminate();
                });
                ws.once('error', () => undefined);
            });

        it('refuses an upgrade with no credentials: 401 and the socket is closed', async () => {
            expect(await open({ ...via(3) })).toEqual({ opened: false, status: 401 });
            expect(h.studyroom.upgrades).toHaveLength(0);
        });

        it('refuses a revoked/garbage token and a query-string token', async () => {
            expect((await open({ cookie: 'accessToken=garbage', ...via(4) })).status).toBe(401);
            const token = await h.issuer.user('wsq', ['STUDENT']);
            const res = await new Promise<number | undefined>((resolve) => {
                const ws = new WebSocket(`${wsUrl()}&token=${token}`, { headers: via(4) });
                ws.once('unexpected-response', (_r, response) => resolve(response.statusCode));
                ws.once('error', () => undefined);
            });
            expect(res).toBe(401);
        });

        it('proxies an authenticated upgrade, forwarding the verified token and the single client IP', async () => {
            const token = await h.issuer.user('wsok', ['STUDENT']);
            const result = await open({ cookie: `accessToken=${token}`, 'x-user-roles': 'SYSTEM_ADMIN', ...via(5) });
            expect(result).toEqual({ opened: true, message: 'hello-from-upstream' });
            const seen = h.studyroom.upgrades[0].headers;
            expect(seen.authorization).toBe(`Bearer ${token}`);
            expect(seen['x-forwarded-for']).toBe(ip(5));
            expect(seen['x-user-roles']).toBeUndefined();
        });

        it('refuses the 21st upgrade in 10 s, whatever X-Forwarded-For the client forges', async () => {
            const token = await h.issuer.user('wsflood', ['STUDENT']);
            // The limit is a fixed 10 s window: do not straddle a boundary mid-test.
            await alignToWindow(10_000, 3_000);
            const results: boolean[] = [];
            const statuses: (number | undefined)[] = [];
            for (let i = 0; i < 21; i++) {
                const r = await open({
                    cookie: `accessToken=${token}`,
                    'x-forwarded-for': `198.51.100.${i + 1}, ${ip(6)}`,
                });
                results.push(r.opened);
                statuses.push(r.status);
            }
            expect(results.slice(0, 20).every(Boolean)).toBe(true);
            expect(statuses[20]).toBe(429);
        });

        it('refuses the upgrade while the study-room page is disabled', async () => {
            const { callControl } = await import('./support/boot-gateway');
            const admin = await h.issuer.service('admin');
            const token = await h.issuer.user('wsflag', ['STUDENT']);
            await callControl(h.grpcUrl, 'SetPageFlags', { flags: { 'study-room': false } }, admin);
            try {
                expect((await open({ cookie: `accessToken=${token}`, ...via(7) })).status).toBe(403);
            } finally {
                await callControl(h.grpcUrl, 'SetPageFlags', { flags: {} }, admin);
            }
        });

        it('closes upgrades for paths that are not a websocket route', async () => {
            const status = await new Promise<number | undefined>((resolve) => {
                const ws = new WebSocket(`${h.baseUrl.replace('http', 'ws')}/api/v1/quizsets`, { headers: via(8) });
                ws.once('unexpected-response', (_r, res) => resolve(res.statusCode));
                ws.once('error', () => resolve(undefined));
            });
            expect(status).toBe(404);
        });
    });
});
