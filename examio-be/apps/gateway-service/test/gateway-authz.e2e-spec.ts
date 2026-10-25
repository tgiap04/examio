import { connect } from 'amqplib';
import { createEnvelope } from '@examio/messaging';
import { bootGateway, callControl, type Harness } from './support/boot-gateway';
import { RUN, sidOf, subjectOf } from './support/tokens';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ip = (n: number) => `10.${(Number.parseInt(RUN, 36) % 200) + 20}.${n}.8`;
const via = (n: number) => ({ 'x-forwarded-for': `203.0.113.251, ${ip(n)}` });

/**
 * Identity enforcement at the edge: verify, revoke, stale `av` (fast gRPC path
 * and durable event path), coarse permissions, optional-route stripping,
 * service-token rejection, GatewayControl authorization, Redis outage policy.
 */
describe('gateway authorization (e2e)', () => {
    let h: Harness;
    const get = (path: string, token: string, extra: Record<string, string> = {}) =>
        fetch(`${h.baseUrl}${path}`, { headers: { authorization: `Bearer ${token}`, ...extra } });
    const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code;

    beforeAll(async () => {
        h = await bootGateway();
    }, 60_000);
    afterAll(() => h?.close());
    beforeEach(() => {
        for (const u of [h.exam, h.aichat, h.auth, h.finance, h.admin]) u.reset();
    });

    describe('token verification', () => {
        it('expired -> 401 TOKEN_EXPIRED; garbage -> 401 TOKEN_INVALID', async () => {
            const expired = await h.issuer.user('old', ['TEACHER'], { expiresInSeconds: -60 });
            const r1 = await get('/api/v1/quizsets', expired, via(1));
            expect([r1.status, await codeOf(r1)]).toEqual([401, 'TOKEN_EXPIRED']);
            const r2 = await get('/api/v1/quizsets', 'not-a-jwt', via(1));
            expect([r2.status, await codeOf(r2)]).toEqual([401, 'TOKEN_INVALID']);
            expect(h.exam.seen).toHaveLength(0);
        });

        it('a service token (aud=finance / aud=gateway) is TOKEN_INVALID on every route', async () => {
            for (const aud of ['finance', 'gateway']) {
                const svc = await h.issuer.service('exam', aud);
                for (const path of ['/api/v1/quizsets', '/api/v1/wallet/details', '/api/v1/subjects']) {
                    const res = await get(path, svc, via(2));
                    // `optional` routes strip it and answer anonymously; required ones reject.
                    if (path === '/api/v1/subjects') {
                        expect(res.status).toBe(200);
                        expect(h.aichat.seen.at(-1)!.headers.authorization).toBeUndefined();
                    } else {
                        expect([res.status, await codeOf(res)]).toEqual([401, 'TOKEN_INVALID']);
                    }
                }
            }
        });

        it('STUDENT on /api/v1/ai/models is refused before reaching the upstream', async () => {
            const student = await h.issuer.user('stu', ['STUDENT']);
            const res = await get('/api/v1/ai/models', student, via(3));
            expect([res.status, await codeOf(res)]).toEqual([403, 'PERMISSION_DENIED']);
            expect(h.exam.seen).toHaveLength(0);
            const teacher = await h.issuer.user('tea', ['TEACHER']);
            expect((await get('/api/v1/ai/models', teacher, via(3))).status).toBe(200);
        });

        it('an unverified email gets EMAIL_NOT_VERIFIED on a permissioned route', async () => {
            const t = await h.issuer.user('unv', ['TEACHER'], { emailVerified: false });
            const res = await get('/api/v1/ai/models', t, via(4));
            expect([res.status, await codeOf(res)]).toEqual([403, 'EMAIL_NOT_VERIFIED']);
        });

        it('quiz-practice access check is auth-optional (garbage token stripped, anonymous allowed); its siblings stay required', async () => {
            const access = '/api/v1/quiz-practice/sets/q1/access';
            const bad = await get(access, 'not-a-jwt', via(6));
            expect(bad.status).toBe(200);
            expect(h.exam.seen.at(-1)!.headers.authorization).toBeUndefined();
            expect((await fetch(`${h.baseUrl}${access}`, { headers: via(6) })).status).toBe(200);
            for (const path of ['/api/v1/quiz-practice/sets', '/api/v1/quiz-practice/attempts/a1']) {
                expect((await fetch(`${h.baseUrl}${path}`, { headers: via(6) })).status).toBe(401);
                expect((await get(path, 'not-a-jwt', via(6))).status).toBe(401);
            }
        });

        it('optional route + revoked token: the upstream sees no credentials and the call succeeds (RT-6)', async () => {
            const token = await h.issuer.user('opt', ['STUDENT']);
            await callControl(h.grpcUrl, 'RevokeSession', { sid: sidOf('opt'), exp: String(Math.floor(Date.now() / 1000) + 600) }, await h.issuer.service('auth'));
            const res = await fetch(`${h.baseUrl}/api/v1/subjects`, {
                headers: { authorization: `Bearer ${token}`, cookie: `accessToken=${token}; theme=dark`, ...via(5) },
            });
            expect(res.status).toBe(200);
            const seen = h.aichat.seen[0].headers;
            expect(seen.authorization).toBeUndefined();
            expect(seen.cookie).toBe('theme=dark');
        });
    });

    describe('revocation and staleness', () => {
        it('RevokeSession -> 401 SESSION_REVOKED on the next request', async () => {
            const token = await h.issuer.user('rev', ['TEACHER']);
            expect((await get('/api/v1/quizsets', token, via(6))).status).toBe(200);
            const rpc = await callControl(h.grpcUrl, 'RevokeSession', { sid: sidOf('rev'), exp: String(Math.floor(Date.now() / 1000) + 600) }, await h.issuer.service('auth'));
            expect(rpc.code).toBe(0);
            const res = await get('/api/v1/quizsets', token, via(6));
            expect([res.status, await codeOf(res)]).toEqual([401, 'SESSION_REVOKED']);
        });

        it('InvalidateUser(av+1) -> TOKEN_STALE; a fresh token passes (fast path)', async () => {
            const stale = await h.issuer.user('fast', ['TEACHER'], { av: 1 });
            expect((await get('/api/v1/quizsets', stale, via(7))).status).toBe(200);
            const rpc = await callControl(h.grpcUrl, 'InvalidateUser', { userId: subjectOf('fast'), authzVersion: '2' }, await h.issuer.service('auth'));
            expect(rpc.code).toBe(0);
            const res = await get('/api/v1/quizsets', stale, via(7));
            expect([res.status, await codeOf(res)]).toEqual([401, 'TOKEN_STALE']);
            const fresh = await h.issuer.user('fast', ['TEACHER'], { av: 2 });
            expect((await get('/api/v1/quizsets', fresh, via(7))).status).toBe(200);
        });

        it('durable path: authz_changed event alone (GatewayControl never called) -> TOKEN_STALE within 2 s', async () => {
            const amqpAuth = process.env.RABBITMQ_AUTH_URL;
            if (!amqpAuth) throw new Error('RABBITMQ_AUTH_URL (auth broker user) is required for the durable-path test');
            const gwConn = await connect(process.env.RABBITMQ_URL!);
            const gwCh = await gwConn.createChannel();
            for (let i = 0; i < 60; i++) {
                if ((await gwCh.checkQueue('gateway.events')).consumerCount > 0) break;
                await sleep(250);
            }
            expect((await gwCh.checkQueue('gateway.events')).consumerCount).toBeGreaterThan(0);
            await gwConn.close();

            const token = await h.issuer.user('durable', ['TEACHER'], { av: 3 });
            expect((await get('/api/v1/quizsets', token, via(8))).status).toBe(200);

            const conn = await connect(amqpAuth);
            const ch = await conn.createChannel();
            const publish = (authzVersion: number) => {
                const envelope = createEnvelope(
                    'auth.user.authz_changed',
                    { userId: subjectOf('durable'), authzVersion, version: authzVersion, role: 'STUDENT', reason: 'role' },
                    { source: 'auth' }
                );
                ch.publish('examio.events', envelope.type, Buffer.from(JSON.stringify(envelope)), {
                    persistent: true,
                    messageId: envelope.id,
                    contentType: 'application/json',
                });
            };
            const startedAt = Date.now();
            publish(4);
            let code: string | undefined;
            while (Date.now() - startedAt < 2000) {
                const res = await get('/api/v1/quizsets', token, via(8));
                if (res.status === 401) {
                    code = await codeOf(res);
                    break;
                }
                await sleep(50);
            }
            expect(code).toBe('TOKEN_STALE');
            expect(Date.now() - startedAt).toBeLessThan(2000);

            // Order-safe: a reordered older event never lowers the version.
            publish(2);
            await sleep(500);
            const res = await get('/api/v1/quizsets', token, via(8));
            expect(await codeOf(res)).toBe('TOKEN_STALE');
            const fresh = await h.issuer.user('durable', ['TEACHER'], { av: 4 });
            expect((await get('/api/v1/quizsets', fresh, via(8))).status).toBe(200);
            await conn.close();
        }, 30_000);
    });
});
