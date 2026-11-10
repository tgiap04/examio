import { Metadata } from '@grpc/grpc-js';
import * as request from 'supertest';
import { lastValueFrom } from 'rxjs';
import { authV1, PROTO_FILES } from '@kmaedu/contracts';
import { createTestGrpcClient } from '@kmaedu/grpc/testing';
import {
    AuthApp,
    SERVICE_SECRETS,
    bootAuthApp,
    loginVerified,
    registerUser,
} from './helpers/auth-app';

describe('auth gRPC identity RPCs behind the real guards (e2e)', () => {
    let ctx: AuthApp;
    let client: authV1.AuthServiceClient;
    beforeAll(async () => {
        ctx = await bootAuthApp({ grpc: true });
        client = createTestGrpcClient(ctx.grpcUrl as string, [PROTO_FILES.auth]).getService<authV1.AuthServiceClient>(
            authV1.AUTH_SERVICE_NAME
        );
    });
    afterAll(() => ctx.close());

    const md = (token?: string) => {
        const m = new Metadata();
        if (token) m.set('authorization', `Bearer ${token}`);
        return m;
    };
    const serviceToken = async (name: keyof typeof SERVICE_SECRETS) =>
        (
            await request(ctx.url)
                .post('/internal/token')
                .send({ client_id: name, client_secret: SERVICE_SECRETS[name], audience: 'auth' })
        ).body.access_token as string;

    async function studentWithToken() {
        const u = await registerUser(ctx);
        const login = await loginVerified(ctx, u.email);
        return { ...u, token: login.body.token as string };
    }

    it('GetPublicProfilesByIds has no email key (student token, real DB, input order)', async () => {
        const a = await studentWithToken();
        const b = await registerUser(ctx);
        const res = await lastValueFrom(
            client.getPublicProfilesByIds({ userIds: [b.id, 'ghost', a.id] }, md(a.token))
        );
        expect(res.profiles.map((p) => p.id)).toEqual([b.id, a.id]);
        for (const p of res.profiles) {
            expect(Object.keys(p).sort()).toEqual(['avatar', 'id', 'name', 'username']);
            expect(JSON.stringify(p)).not.toContain('@e2e.test');
        }
    });

    it('GetUsersByIds with a STUDENT user token is PERMISSION_DENIED', async () => {
        const a = await studentWithToken();
        await expect(
            lastValueFrom(client.getUsersByIds({ userIds: [a.id] }, md(a.token)))
        ).rejects.toMatchObject({ code: 7 });
    });

    it('GetUsersByIds with svc:admin returns the full user (email included)', async () => {
        const a = await registerUser(ctx);
        const res = await lastValueFrom(
            client.getUsersByIds({ userIds: [a.id] }, md(await serviceToken('admin')))
        );
        expect(res.users[0]).toMatchObject({ id: a.id, email: a.email, role: authV1.BaseRole.BASE_ROLE_STUDENT });
    });

    it('svc:exam may not read email-bearing RPCs; no metadata is UNAUTHENTICATED', async () => {
        const a = await registerUser(ctx);
        await expect(
            lastValueFrom(client.getUser({ userId: a.id }, md(await serviceToken('exam'))))
        ).rejects.toMatchObject({ code: 7 });
        await expect(lastValueFrom(client.getUser({ userId: a.id }, md()))).rejects.toMatchObject({ code: 16 });
    });

    it('ListUsers: a SYSTEM_ADMIN user token can page TEACHERs; no service token can', async () => {
        const t = await registerUser(ctx);
        await ctx.prisma.user.update({ where: { id: t.id }, data: { role: 'TEACHER' } });
        const admin = await registerUser(ctx);
        await ctx.prisma.user.update({ where: { id: admin.id }, data: { isSystemAdmin: true, isVerified: true } });
        const adminLogin = await loginVerified(ctx, admin.email);
        const res = await lastValueFrom(
            client.listUsers(
                { query: t.username, role: authV1.BaseRole.BASE_ROLE_TEACHER, page: 1, limit: 10 },
                md(adminLogin.body.token)
            )
        );
        expect(res.users.map((u) => u.id)).toEqual([t.id]);
        for (const svc of ['exam', 'admin', 'content'] as const) {
            await expect(
                lastValueFrom(client.listUsers({ query: '', page: 1, limit: 10 }, md(await serviceToken(svc))))
            ).rejects.toMatchObject({ code: 7 });
        }
    });

    it('SetUserRole by a STUDENT token or a service token is PERMISSION_DENIED and changes nothing', async () => {
        const a = await studentWithToken();
        await expect(
            lastValueFrom(client.setUserRole({ userId: a.id, role: authV1.BaseRole.BASE_ROLE_TEACHER, reason: '' }, md(a.token)))
        ).rejects.toMatchObject({ code: 7 });
        await expect(
            lastValueFrom(client.setUserRole({ userId: a.id, role: authV1.BaseRole.BASE_ROLE_TEACHER, reason: '' }, md(await serviceToken('admin'))))
        ).rejects.toMatchObject({ code: 7 });
        expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: a.id } })).role).toBe('STUDENT');
    });

    it('SetUserRole by a real SYSTEM_ADMIN token promotes the target, logs the actor, emits one event', async () => {
        const admin = await registerUser(ctx);
        await ctx.prisma.user.update({ where: { id: admin.id }, data: { isSystemAdmin: true, isVerified: true } });
        const adminLogin = await loginVerified(ctx, admin.email);
        const target = await registerUser(ctx);

        const res = await lastValueFrom(
            client.setUserRole(
                { userId: target.id, role: authV1.BaseRole.BASE_ROLE_TEACHER, reason: 'e2e promote' },
                md(adminLogin.body.token)
            )
        );
        expect(res.user?.role).toBe(authV1.BaseRole.BASE_ROLE_TEACHER);

        const log = await ctx.prisma.roleChangeLog.findFirstOrThrow({ where: { targetUserId: target.id } });
        expect(log).toMatchObject({ actorUserId: admin.id, fromRole: 'STUDENT', toRole: 'TEACHER', reason: 'e2e promote', source: 'admin-ui' });
        const events = await ctx.prisma.outboxEvent.findMany({
            where: { type: 'auth.user.authz_changed', envelope: { path: ['data', 'userId'], equals: target.id } },
        });
        expect(events).toHaveLength(1);

        // The admin cannot change their own role over gRPC.
        await expect(
            lastValueFrom(client.setUserRole({ userId: admin.id, role: authV1.BaseRole.BASE_ROLE_TEACHER, reason: '' }, md(adminLogin.body.token)))
        ).rejects.toMatchObject({ code: 7, details: 'CANNOT_CHANGE_OWN_ROLE' });
    });
});
