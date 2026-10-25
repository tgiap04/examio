import { status } from '@grpc/grpc-js';
import { RedisService } from '@examio/redis';
import { bootGateway, callControl, type Harness } from './support/boot-gateway';
import { RUN, subjectOf } from './support/tokens';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ip = (n: number) => `10.${(Number.parseInt(RUN, 36) % 200) + 20}.${n}.8`;
const via = (n: number) => ({ 'x-forwarded-for': `203.0.113.251, ${ip(n)}` });

/**
 * GatewayControl authorization (who may call which RPC), page flags set through it,
 * and the Redis outage policy (RT-3).
 */
describe('gateway control plane and outage policy (e2e)', () => {
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

    describe('GatewayControl authorization', () => {
        const flags = { 'ai-tool': false };
        it('only the allowlisted service may call each RPC', async () => {
            const user = await h.issuer.user('ctl', ['SYSTEM_ADMIN']);
            const call = (method: 'InvalidateUser' | 'RevokeSession' | 'SetPageFlags', body: Record<string, unknown>, token?: string) =>
                callControl(h.grpcUrl, method, body, token).then((r) => r.code);
            const inv = { userId: subjectOf('ctl'), authzVersion: '1' };

            expect(await call('InvalidateUser', inv)).toBe(status.UNAUTHENTICATED);
            expect(await call('InvalidateUser', inv, user)).toBe(status.PERMISSION_DENIED);
            expect(await call('InvalidateUser', inv, await h.issuer.service('exam'))).toBe(status.PERMISSION_DENIED);
            expect(await call('InvalidateUser', inv, await h.issuer.service('admin'))).toBe(status.PERMISSION_DENIED);
            expect(await call('InvalidateUser', inv, await h.issuer.service('auth', 'finance'))).toBe(status.UNAUTHENTICATED);
            expect(await call('InvalidateUser', inv, await h.issuer.service('auth'))).toBe(0);

            expect(await call('SetPageFlags', { flags }, await h.issuer.service('auth'))).toBe(status.PERMISSION_DENIED);
            expect(await call('RevokeSession', { sid: 's', exp: '9999999999' }, await h.issuer.service('admin'))).toBe(status.PERMISSION_DENIED);
        });

        it('rejects malformed arguments', async () => {
            const auth = await h.issuer.service('auth');
            expect((await callControl(h.grpcUrl, 'InvalidateUser', { userId: '', authzVersion: '1' }, auth)).code).toBe(status.INVALID_ARGUMENT);
            expect((await callControl(h.grpcUrl, 'RevokeSession', { sid: 's', exp: '-5' }, auth)).code).toBe(status.INVALID_ARGUMENT);
        });

        it('SetPageFlags(admin) switches a page off for the next request, and back on', async () => {
            const teacher = await h.issuer.user('flag', ['TEACHER']);
            const admin = await h.issuer.service('admin');
            expect((await callControl(h.grpcUrl, 'SetPageFlags', { flags }, admin)).code).toBe(0);
            try {
                const res = await get('/api/v1/ai/models', teacher, via(9));
                expect([res.status, await codeOf(res)]).toEqual([403, 'PAGE_DISABLED']);
                const pages = await (await fetch(`${h.baseUrl}/api/v1/config/pages`, { headers: via(9) })).json();
                expect(pages.pages).toEqual([{ key: 'ai-tool', enabled: false }]);
            } finally {
                await callControl(h.grpcUrl, 'SetPageFlags', { flags: {} }, admin);
            }
            expect((await get('/api/v1/ai/models', teacher, via(9))).status).toBe(200);
        });
    });

    describe('Redis outage policy (RT-3)', () => {
        it('admin and state-changing requests fail closed (503); non-admin GET passes', async () => {
            const teacher = await h.issuer.user('down', ['TEACHER']);
            const admin = await h.issuer.user('downadm', ['TEACHER', 'SYSTEM_ADMIN']);
            const client = h.app.get(RedisService).getClient();
            client.disconnect();
            try {
                const read = await get('/api/v1/quizsets', teacher, via(10));
                expect(read.status).toBe(200);
                const write = await fetch(`${h.baseUrl}/api/v1/quizsets`, {
                    method: 'POST',
                    headers: { authorization: `Bearer ${teacher}`, ...via(10) },
                    body: '{}',
                });
                expect([write.status, await codeOf(write)]).toEqual([503, 'AUTH_STATE_UNAVAILABLE']);
                const adminRead = await get('/api/v1/admin/users', admin, via(10));
                expect([adminRead.status, await codeOf(adminRead)]).toEqual([503, 'AUTH_STATE_UNAVAILABLE']);
                const optionalWrite = await fetch(`${h.baseUrl}/api/v1/subjects`, {
                    method: 'POST',
                    headers: { authorization: `Bearer ${teacher}`, ...via(10) },
                    body: '{}',
                });
                expect(optionalWrite.status).toBe(200);
                expect(h.aichat.seen.at(-1)!.headers.authorization).toBeUndefined();
            } finally {
                client.connect();
                for (let i = 0; i < 40 && client.status !== 'ready'; i++) await sleep(100);
            }
            expect(client.status).toBe('ready');
        });
    });
});
