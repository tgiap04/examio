import { Metadata } from '@grpc/grpc-js';
import { lastValueFrom } from 'rxjs';
import * as request from 'supertest';
import { authUsersV1, authV1, PROTO_FILES } from '@kmaedu/contracts';
import { createTestGrpcClient } from '@kmaedu/grpc/testing';
import {
    AuthApp,
    SERVICE_SECRETS,
    bootAuthApp,
    loginVerified,
    registerUser,
    uniq,
} from './helpers/auth-app';

describe('auth user RPCs of phase 10 (e2e, real Postgres + real guards)', () => {
    let ctx: AuthApp;
    let users: authUsersV1.AuthUserServiceClient;
    let auth: authV1.AuthServiceClient;
    type Account = { id: string; email: string; username: string; token: string };
    let admin: Account;
    let teacher: Account;
    let student: Account;

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

    async function account(patch: { role?: 'TEACHER'; isSystemAdmin?: boolean; utmSource?: string }) {
        const u = await registerUser(ctx);
        await ctx.prisma.user.update({ where: { id: u.id }, data: patch });
        const login = await loginVerified(ctx, u.email);
        return { id: u.id, email: u.email, username: u.username, token: login.body.token as string };
    }

    beforeAll(async () => {
        ctx = await bootAuthApp({ grpc: true });
        const client = createTestGrpcClient(ctx.grpcUrl as string, [PROTO_FILES.auth, PROTO_FILES.authUsers]);
        users = client.getService<authUsersV1.AuthUserServiceClient>(authUsersV1.AUTH_USER_SERVICE_NAME);
        auth = client.getService<authV1.AuthServiceClient>(authV1.AUTH_SERVICE_NAME);
        admin = await account({ isSystemAdmin: true });
        teacher = await account({ role: 'TEACHER' });
        student = await account({});
    });
    afterAll(() => ctx.close());

    describe('UpdateUserAdmin', () => {
        it('changes the profile, stamps updatedBy with the token sub and writes auth.user.updated in the same tx', async () => {
            const target = await registerUser(ctx);
            const res = await lastValueFrom(
                users.updateUserAdmin({ userId: target.id, name: 'New Name', bio: 'about', isVerified: true }, md(admin.token))
            );
            expect(res.user).toMatchObject({ id: target.id, name: 'New Name', bio: 'about', isVerified: true });

            const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: target.id } });
            expect(row.updatedBy).toBe(admin.id);
            const events = await ctx.prisma.outboxEvent.findMany({
                where: { type: 'auth.user.updated', envelope: { path: ['data', 'userId'], equals: target.id } },
            });
            expect(events).toHaveLength(1);
            const data = (events[0].envelope as { data: { changed: string[]; version: number } }).data;
            expect([...data.changed].sort()).toEqual(['bio', 'is_verified', 'name']);
            expect(data.version).toBe(row.updatedAt.getTime());
        });

        it('a no-op update writes neither a row change nor an event', async () => {
            const target = await registerUser(ctx);
            await lastValueFrom(users.updateUserAdmin({ userId: target.id, name: 'Same' }, md(admin.token)));
            const before = await ctx.prisma.outboxEvent.count({ where: { type: 'auth.user.updated' } });
            await lastValueFrom(users.updateUserAdmin({ userId: target.id, name: 'Same' }, md(admin.token)));
            expect(await ctx.prisma.outboxEvent.count({ where: { type: 'auth.user.updated' } })).toBe(before);
        });

        it('requires user:manage: a STUDENT/TEACHER token and a service token are PERMISSION_DENIED and nothing changes', async () => {
            const target = await registerUser(ctx);
            for (const token of [student.token, teacher.token, await serviceToken('admin')]) {
                await expect(
                    lastValueFrom(users.updateUserAdmin({ userId: target.id, name: 'Hacked' }, md(token)))
                ).rejects.toMatchObject({ code: 7 });
            }
            await expect(
                lastValueFrom(users.updateUserAdmin({ userId: target.id, name: 'x' }, md()))
            ).rejects.toMatchObject({ code: 16 });
            expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: target.id } })).name).toBeNull();
        });

        it('validates at the boundary: empty patch, blank name, long bio -> INVALID_ARGUMENT; unknown user -> NOT_FOUND', async () => {
            const target = await registerUser(ctx);
            for (const req of [
                { userId: target.id },
                { userId: target.id, name: '   ' },
                { userId: target.id, bio: 'x'.repeat(501) },
                { userId: '' , name: 'x' },
            ]) {
                await expect(lastValueFrom(users.updateUserAdmin(req, md(admin.token)))).rejects.toMatchObject({ code: 3 });
            }
            await expect(
                lastValueFrom(users.updateUserAdmin({ userId: 'ghost', name: 'x' }, md(admin.token)))
            ).rejects.toMatchObject({ code: 5 });
        });
    });

    describe('SearchUsers', () => {
        it('returns display-safe profiles by prefix, never an email, excludes the caller, and exact email matches', async () => {
            const prefix = uniq('srch');
            const a = await registerUser(ctx, `${prefix}a`);
            const b = await registerUser(ctx, `${prefix}b`);
            const res = await lastValueFrom(users.searchUsers({ query: prefix, limit: 10 }, md(teacher.token)));
            expect(res.profiles.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
            for (const p of res.profiles) {
                expect(Object.keys(p).sort()).toEqual(['avatar', 'id', 'name', 'username']);
            }
            const byEmail = await lastValueFrom(users.searchUsers({ query: a.email, limit: 10 }, md(teacher.token)));
            expect(byEmail.profiles.map((p) => p.id)).toEqual([a.id]);
            // the caller never finds themself
            const self = await lastValueFrom(users.searchUsers({ query: teacher.username, limit: 10 }, md(teacher.token)));
            expect(self.profiles.map((p) => p.id)).not.toContain(teacher.id);
        });

        it('caps the result at 20 and rejects queries shorter than 3 characters', async () => {
            const prefix = uniq('cap');
            for (let i = 0; i < 22; i++) await registerUser(ctx, `${prefix}${String(i).padStart(2, '0')}`);
            const res = await lastValueFrom(users.searchUsers({ query: prefix, limit: 500 }, md(teacher.token)));
            expect(res.profiles).toHaveLength(20);
            await expect(lastValueFrom(users.searchUsers({ query: 'ab', limit: 5 }, md(teacher.token)))).rejects.toMatchObject({ code: 3 });
        });

        it('needs user:search: a STUDENT token is PERMISSION_DENIED', async () => {
            await expect(
                lastValueFrom(users.searchUsers({ query: 'abcdef', limit: 5 }, md(student.token)))
            ).rejects.toMatchObject({ code: 7 });
        });
    });

    describe('GetUserStats', () => {
        it('requires stats:read', async () => {
            await expect(lastValueFrom(users.getUserStats({ days: 7, includeUtmSources: false }, md(student.token)))).rejects.toMatchObject({ code: 7 });
            await expect(lastValueFrom(users.getUserStats({ days: 7, includeUtmSources: false }, md(await serviceToken('admin'))))).rejects.toMatchObject({ code: 7 });
        });

        it('returns counts, both series and the utm breakdown for an admin token', async () => {
            // unique per run: the breakdown counts every row in the DB, so a fixed literal breaks reruns
            const utmSource = `e2e-source-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            await account({ utmSource });
            const res = await lastValueFrom(users.getUserStats({ days: 7, includeUtmSources: true }, md(admin.token)));
            expect(Number(res.totalUsers)).toBeGreaterThanOrEqual(4);
            expect(Number(res.activeLast30d)).toBeGreaterThanOrEqual(1);
            expect(Number(res.activeToday)).toBeGreaterThanOrEqual(1);
            expect(Number(res.signupsSeries.reduce((n, p) => n + Number(p.value), 0))).toBeGreaterThanOrEqual(4);
            expect(res.signupsSeries[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(res.utmSources.find((r) => r.source === utmSource)?.count).toBe('1');
        });

        it('computes the utm breakdown only on request and rejects an out-of-range window', async () => {
            const res = await lastValueFrom(users.getUserStats({ days: 7, includeUtmSources: false }, md(admin.token)));
            expect(res.utmSources).toEqual([]);
            await expect(lastValueFrom(users.getUserStats({ days: 400, includeUtmSources: false }, md(admin.token)))).rejects.toMatchObject({ code: 3 });
        });
    });

    describe('GetUserAdminDetail / ListUsers / GetUsersByIds', () => {
        it('detail carries the account and its latest session; unknown user is NOT_FOUND; needs user:manage', async () => {
            const res = await lastValueFrom(users.getUserAdminDetail({ userId: student.id }, md(admin.token)));
            expect(res.user).toMatchObject({ id: student.id });
            expect(res.lastSession).toMatchObject({ isActive: true });
            await expect(lastValueFrom(users.getUserAdminDetail({ userId: 'ghost' }, md(admin.token)))).rejects.toMatchObject({ code: 5 });
            await expect(lastValueFrom(users.getUserAdminDetail({ userId: student.id }, md(student.token)))).rejects.toMatchObject({ code: 7 });
        });

        it('ListUsers filters by is_verified and created range, and walks keyset pages without overlap', async () => {
            const tag = uniq('lst');
            const made: Array<{ id: string }> = [];
            for (let i = 0; i < 5; i++) made.push(await registerUser(ctx, `${tag}${i}`));
            const token = md(admin.token);
            const filtered = await lastValueFrom(
                auth.listUsers({ query: tag, page: 1, limit: 50, isVerified: false, createdFrom: String(Date.now() - 60_000), createdTo: String(Date.now() + 60_000) }, token)
            );
            expect(filtered.users).toHaveLength(5);
            const none = await lastValueFrom(auth.listUsers({ query: tag, page: 1, limit: 50, isVerified: true }, token));
            expect(none.users).toHaveLength(0);

            const seen: string[] = [];
            let cursor: string | undefined = '';
            for (let guard = 0; guard < 5 && cursor !== undefined; guard++) {
                const page: authV1.ListUsersResponse = await lastValueFrom(
                    auth.listUsers({ query: tag, page: 1, limit: 2, cursor }, token)
                );
                seen.push(...page.users.map((u) => u.id));
                cursor = page.nextCursor;
            }
            expect([...seen].sort()).toEqual(made.map((m) => m.id).sort());
            expect(new Set(seen).size).toBe(5);
        });

        it('GetUsersByIds is admin-only: svc:admin works, svc:exam and svc:content are PERMISSION_DENIED', async () => {
            const res = await lastValueFrom(auth.getUsersByIds({ userIds: [student.id] }, md(await serviceToken('admin'))));
            expect(res.users[0]).toMatchObject({ id: student.id, email: expect.stringContaining('@') });
            for (const svc of ['exam', 'content'] as const) {
                await expect(
                    lastValueFrom(auth.getUsersByIds({ userIds: [student.id] }, md(await serviceToken(svc))))
                ).rejects.toMatchObject({ code: 7 });
            }
        });
    });

    describe('profile edits by the user themself', () => {
        it('PATCH profile publishes auth.user.updated (cache invalidation for consumers) with version = updatedAt', async () => {
            const res = await request(ctx.url)
                .put('/api/v1/profile')
                .set('authorization', `Bearer ${student.token}`)
                .send({ name: 'Self Edit' });
            expect([200, 201]).toContain(res.status);
            const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: student.id } });
            expect(row.name).toBe('Self Edit');
            const events = await ctx.prisma.outboxEvent.findMany({
                where: { type: 'auth.user.updated', envelope: { path: ['data', 'userId'], equals: student.id } },
            });
            expect(events.length).toBeGreaterThanOrEqual(1);
            const last = events[events.length - 1].envelope as { data: { changed: string[]; version: number } };
            expect(last.data.changed).toContain('name');
            expect(last.data.version).toBe(row.updatedAt.getTime());
        });
    });
});
