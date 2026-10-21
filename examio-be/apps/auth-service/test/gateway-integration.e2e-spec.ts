import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GatewayControlClient } from '../src/clients/gateway-control.client';
import { RoleChangeService } from '../src/roles/role-change.service';
import { reservePort } from '../../gateway-service/test/support/ports';
import {
    bootGateway,
    type Harness,
} from '../../gateway-service/test/support/boot-gateway';
import { AuthApp, PASSWORD, bootAuthApp, decodeClaims, uniq } from './helpers/auth-app';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/**
 * Real auth-service + real gateway + real outbox relay in one process, on real
 * Postgres / Redis / RabbitMQ. The browser-facing contract: cookies, logout
 * revocation, role-change staleness (fast gRPC path AND durable event path),
 * refresh recovery. Needs RABBITMQ_URL (auth user) and RABBITMQ_GATEWAY_URL.
 */
describe('auth <-> gateway (e2e)', () => {
    let auth: AuthApp;
    let gw: Harness;
    let worker: INestApplicationContext;
    let roles: RoleChangeService;
    let control: GatewayControlClient;
    const cli = { kind: 'system', email: 'e2e@system' } as const;
    // A fresh forged-chain address per call keeps the anonymous auth limits out of the way.
    let n = 0;
    const xff = () => ({ 'x-forwarded-for': `203.0.113.9, 10.77.${Date.now() % 250}.${(n++ % 250) + 1}` });

    beforeAll(async () => {
        const gatewayAmqp = process.env.RABBITMQ_GATEWAY_URL;
        if (!gatewayAmqp) throw new Error('RABBITMQ_GATEWAY_URL (gateway broker user) is required');
        const grpcPort = await reservePort();
        process.env.GATEWAY_CONTROL_ENABLED = 'true';
        process.env.GATEWAY_GRPC_URL = `127.0.0.1:${grpcPort}`;

        auth = await bootAuthApp();
        roles = auth.app.get(RoleChangeService, { strict: false });
        control = auth.app.get(GatewayControlClient, { strict: false });

        // The relay publishes auth's outbox (auth broker user); started before the
        // gateway harness switches RABBITMQ_URL to the gateway's own user.
        const { WorkerModule } = await import('../src/worker.module');
        worker = await NestFactory.createApplicationContext(WorkerModule, { logger: ['error'] });

        gw = await bootGateway({
            RABBITMQ_URL: gatewayAmqp,
            GRPC_PORT: String(grpcPort),
            AUTH_SERVICE_URL: auth.url,
            AUTH_JWKS_URL: `${auth.url}/.well-known/jwks.json`,
        });
    }, 90_000);

    afterAll(async () => {
        await worker?.close();
        await gw?.close();
        await auth?.close();
    });

    const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
        fetch(`${gw.baseUrl}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-device-id': uniq('dev'), ...xff(), ...headers },
            body: JSON.stringify(body),
        });
    const get = (path: string, headers: Record<string, string>) =>
        fetch(`${gw.baseUrl}${path}`, { headers: { ...xff(), ...headers } });
    const cookieValue = (res: Response, name: string) =>
        res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(';')[0].slice(name.length + 1);

    async function signUp(over: Record<string, unknown> = {}) {
        const name = uniq('gw');
        const email = `${name}@e2e.test`;
        const res = await post('/api/v1/auth/register', { username: name, email, password: PASSWORD });
        expect(res.status).toBe(201);
        const user = await auth.prisma.user.update({ where: { email }, data: { isVerified: true, ...over } });
        return { res, user, email, access: cookieValue(res, 'accessToken')!, refresh: cookieValue(res, 'refreshToken')! };
    }

    it('login/register set exactly accessToken + refreshToken: HttpOnly, SameSite=Lax, host-only, scoped paths', async () => {
        const { res } = await signUp();
        const cookies = res.headers.getSetCookie();
        expect(cookies.map((c) => c.split('=')[0]).sort()).toEqual(['accessToken', 'refreshToken']);
        const access = cookies.find((c) => c.startsWith('accessToken='))!;
        const refresh = cookies.find((c) => c.startsWith('refreshToken='))!;
        for (const c of cookies) {
            expect(c).toMatch(/HttpOnly/i);
            expect(c).toMatch(/SameSite=Lax/i);
            expect(c).not.toMatch(/Domain=/i);
        }
        expect(access).toMatch(/Path=\/;/);
        expect(access).toMatch(/Max-Age=900/);
        expect(refresh).toMatch(/Path=\/api\/v1\/auth/);
        expect(refresh).toMatch(/Max-Age=2592000/);
    });

    it('logout, then replaying the old access cookie -> 401 SESSION_REVOKED (RevokeSession over real gRPC)', async () => {
        const { access } = await signUp();
        expect((await get('/api/v1/auth/me', { cookie: `accessToken=${access}` })).status).toBe(200);

        const out = await post('/api/v1/auth/logout', {}, { cookie: `accessToken=${access}` });
        expect(out.status).toBe(201);
        const cleared = out.headers.getSetCookie().map((c) => c.split('=')[0]);
        expect(cleared).toEqual(expect.arrayContaining(['accessToken', 'refreshToken', 'token', 'session_id']));

        const replay = await get('/api/v1/auth/me', { cookie: `accessToken=${access}` });
        expect(replay.status).toBe(401);
        expect(await replay.json()).toMatchObject({ statusCode: 401, code: 'SESSION_REVOKED' });
    });

    it('logout with the GatewayControl RevokeSession call BLOCKED: the durable auth.session.revoked event revokes the token', async () => {
        const { user, access } = await signUp();
        const claims = decodeClaims(access);
        expect((await get('/api/v1/auth/me', { cookie: `accessToken=${access}` })).status).toBe(200);

        const blocked = jest.spyOn(control, 'revokeSession').mockResolvedValue(undefined);
        try {
            const out = await post('/api/v1/auth/logout', {}, { cookie: `accessToken=${access}` });
            expect(out.status).toBe(201);
            expect(blocked).toHaveBeenCalledTimes(1);
        } finally {
            blocked.mockRestore();
        }

        // Same transaction as the deactivation: the session is inactive AND the event row exists.
        expect(await auth.prisma.userSession.count({ where: { sessionId: claims.sid as string, isActive: true } })).toBe(0);
        const events = await auth.prisma.outboxEvent.findMany({
            where: { type: 'auth.session.revoked', envelope: { path: ['data', 'sid'], equals: claims.sid as string } },
        });
        expect(events).toHaveLength(1);
        expect(events[0].envelope).toMatchObject({
            source: 'auth',
            data: { userId: user.id, sid: claims.sid, exp: expect.stringMatching(/^\d+$/), version: expect.stringMatching(/^\d+$/) },
        });

        let code: string | undefined;
        for (let i = 0; i < 100 && code !== 'SESSION_REVOKED'; i++) {
            const res = await get('/api/v1/auth/me', { cookie: `accessToken=${access}` });
            code = res.status === 401 ? ((await res.json()) as { code: string }).code : undefined;
            if (code !== 'SESSION_REVOKED') await sleep(200);
        }
        expect(code).toBe('SESSION_REVOKED');
    }, 60_000);

    it('logout-all-others with the fast path BLOCKED: every other session is revoked through the durable event', async () => {
        const { user, access } = await signUp();
        const second = await post('/api/v1/auth/login', { credential: user.email, password: PASSWORD });
        const secondAccess = cookieValue(second, 'accessToken')!;
        expect((await get('/api/v1/auth/me', { cookie: `accessToken=${secondAccess}` })).status).toBe(200);

        const blocked = jest.spyOn(control, 'revokeSession').mockResolvedValue(undefined);
        try {
            const res = await post('/api/v1/devices/logout-all-others', {}, { cookie: `accessToken=${access}` });
            expect(res.status).toBe(201);
        } finally {
            blocked.mockRestore();
        }

        let code: string | undefined;
        for (let i = 0; i < 100 && code !== 'SESSION_REVOKED'; i++) {
            const res = await get('/api/v1/auth/me', { cookie: `accessToken=${secondAccess}` });
            code = res.status === 401 ? ((await res.json()) as { code: string }).code : undefined;
            if (code !== 'SESSION_REVOKED') await sleep(200);
        }
        expect(code).toBe('SESSION_REVOKED');
        // the caller's own session is untouched
        expect((await get('/api/v1/auth/me', { cookie: `accessToken=${access}` })).status).toBe(200);
    }, 60_000);

    it('a device logged out from another session is revoked too (DELETE /devices/:id)', async () => {
        const { user, access } = await signUp();
        const second = await post('/api/v1/auth/login', { credential: user.email, password: PASSWORD });
        const secondAccess = cookieValue(second, 'accessToken')!;
        const devices = (await (await get('/api/v1/devices', { cookie: `accessToken=${access}` })).json()) as {
            devices: { id: string; isCurrent: boolean }[];
        };
        const other = devices.devices.find((d) => !d.isCurrent)!;
        const del = await fetch(`${gw.baseUrl}/api/v1/devices/${other.id}`, {
            method: 'DELETE',
            headers: { cookie: `accessToken=${access}`, ...xff() },
        });
        expect(del.status).toBe(200);
        const replay = await get('/api/v1/auth/me', { cookie: `accessToken=${secondAccess}` });
        expect(await replay.json()).toMatchObject({ code: 'SESSION_REVOKED' });
    });

    it('role change -> next request 401 TOKEN_STALE (fast path), then refresh succeeds with the new role', async () => {
        const { user, access, refresh } = await signUp();
        expect(decodeClaims(access).roles).toEqual(['STUDENT']);
        await roles.change({ actor: cli, targetUserId: user.id, role: 'TEACHER', source: 'cli' });

        const stale = await get('/api/v1/auth/me', { cookie: `accessToken=${access}` });
        expect(stale.status).toBe(401);
        expect(await stale.json()).toMatchObject({ code: 'TOKEN_STALE' });

        const refreshed = await post('/api/v1/auth/refresh', {}, { cookie: `refreshToken=${refresh}` });
        expect(refreshed.status).toBe(201);
        const fresh = cookieValue(refreshed, 'accessToken')!;
        expect(decodeClaims(fresh).roles).toEqual(['TEACHER']);
        const me = await get('/api/v1/auth/me', { cookie: `accessToken=${fresh}` });
        expect(me.status).toBe(200);
    });

    it('same with the GatewayControl call BLOCKED: the durable authz_changed event makes the token stale', async () => {
        const { user, access, refresh } = await signUp();
        expect((await get('/api/v1/auth/me', { cookie: `accessToken=${access}` })).status).toBe(200);

        const blocked = jest.spyOn(control, 'invalidateUser').mockResolvedValue(undefined);
        try {
            await roles.change({ actor: cli, targetUserId: user.id, role: 'TEACHER', source: 'cli' });
            expect(blocked).toHaveBeenCalledTimes(1);
        } finally {
            blocked.mockRestore();
        }

        let code: string | undefined;
        for (let i = 0; i < 100 && code !== 'TOKEN_STALE'; i++) {
            const res = await get('/api/v1/auth/me', { cookie: `accessToken=${access}` });
            code = res.status === 401 ? ((await res.json()) as { code: string }).code : undefined;
            if (code !== 'TOKEN_STALE') await sleep(200);
        }
        expect(code).toBe('TOKEN_STALE');

        const refreshed = await post('/api/v1/auth/refresh', {}, { cookie: `refreshToken=${refresh}` });
        expect(decodeClaims(cookieValue(refreshed, 'accessToken')!).roles).toEqual(['TEACHER']);
    }, 60_000);

    it('POST /auth/change-password revokes every session (revocation wins over the av bump) and the old token is refused', async () => {
        const { user, access } = await signUp();
        await auth.prisma.resetPasswordCode.create({
            data: { id: uniq('rc'), userId: user.id, code: '123456', expiresAt: new Date(Date.now() + 60_000) },
        });
        const changed = await post(
            '/api/v1/auth/change-password',
            { code: '123456', currentPassword: PASSWORD, newPassword: 'N3w-Passw0rd!x' },
            { cookie: `accessToken=${access}` }
        );
        expect(changed.status).toBe(201);

        const res = await get('/api/v1/auth/me', { cookie: `accessToken=${access}` });
        expect(await res.json()).toMatchObject({ code: 'SESSION_REVOKED' });
        expect(await auth.prisma.userSession.count({ where: { userId: user.id, isActive: true } })).toBe(0);
    });

    it('errors from auth carry the gateway envelope for gateway-made failures, auth bodies pass through untouched', async () => {
        const noToken = await get('/api/v1/auth/me', {});
        expect(await noToken.json()).toMatchObject({ statusCode: 401, code: 'TOKEN_MISSING', requestId: expect.any(String) });
        const bad = await post('/api/v1/auth/login', { credential: 'nobody@e2e.test', password: 'wrong-password-1' });
        expect(bad.status).toBe(401);
        const body = (await bad.json()) as { statusCode: number; message: unknown };
        expect(body.statusCode).toBe(401);
        expect(body.message).toBeDefined();
    });
});
