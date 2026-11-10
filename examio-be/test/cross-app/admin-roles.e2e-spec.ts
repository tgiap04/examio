import { permissionsOf } from '@examio/auth-jwt';
import { Harness, authzEvents, bearer, bootHarness, makeUser, onlyAdmins } from './helpers/real-auth-admin';
import request = require('supertest');

/**
 * `/admin/roles/*` over REAL gRPC to a real auth-service and Postgres. The
 * admin forwards its own token; auth runs the permission guard, the DB actor
 * re-check, the advisory lock and the last-admin guard.
 */
describe('admin role management (e2e, real auth + admin)', () => {
    let h: Harness;
    beforeAll(async () => {
        h = await bootHarness();
    });
    afterAll(() => h.close());

    const roleUrl = (id: string) => `/admin/roles/users/${id}/role`;
    const adminUrl = (id: string) => `/admin/roles/users/${id}/system-admin`;
    const makeAdmin = () => makeUser(h.auth, { isSystemAdmin: true });
    const put = (url: string, token: string, body: unknown) => h.http().put(url).set(bearer(token)).send(body as object);

    it('A sets B to TEACHER: 200, RoleChangeLog, AdminAudit, authzVersion+1, ONE authz_changed; refresh returns the new role', async () => {
        const a = await makeAdmin();
        const b = await makeUser(h.auth);
        const before = await h.auth.prisma.user.findUniqueOrThrow({ where: { id: b.id } });

        const res = await put(roleUrl(b.id), a.token, { role: 'TEACHER', reason: 'Giáo viên khối 10' });
        expect(res.status).toBe(200);
        expect(res.body.user).toMatchObject({ id: b.id, role: 'TEACHER', isSystemAdmin: false });

        const after = await h.auth.prisma.user.findUniqueOrThrow({ where: { id: b.id } });
        expect(after.authzVersion).toBe(before.authzVersion + 1);
        const logs = await h.auth.prisma.roleChangeLog.findMany({ where: { targetUserId: b.id } });
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({
            actorUserId: a.id, actorEmail: a.email, targetEmail: b.email, fromRole: 'STUDENT', toRole: 'TEACHER',
            reason: 'Giáo viên khối 10', source: 'admin-ui',
        });
        const events = await authzEvents(h.auth, b.id);
        expect(events).toHaveLength(1);
        expect((events[0].envelope as { data: Record<string, unknown> }).data).toMatchObject({ role: 'TEACHER', reason: 'role' });
        const audit = await h.adminDb.adminAudit.findMany({ where: { targetId: b.id, action: 'admin.role.set_base' } });
        expect(audit).toHaveLength(1);
        expect(audit[0]).toMatchObject({ adminId: a.id });
        expect(audit[0].payload).toEqual({ from: 'STUDENT', to: 'TEACHER', reason: 'Giáo viên khối 10' });

        // The promoted user's next refresh carries the new role (and a higher av).
        const refreshed = await request(h.auth.url).post('/api/v1/auth/refresh').send({ refreshToken: b.refreshToken });
        expect(refreshed.status).toBe(201);
        expect(refreshed.body.roles).toEqual(['TEACHER']);
        expect(refreshed.body.permissions).toEqual(permissionsOf(['TEACHER']));
    });

    it('A cannot change their own role or admin flag: 403 CANNOT_CHANGE_OWN_ROLE, nothing written', async () => {
        const a = await makeAdmin();
        for (const [url, body] of [[roleUrl(a.id), { role: 'TEACHER' }], [adminUrl(a.id), { isSystemAdmin: false }]] as const) {
            const res = await put(url, a.token, body);
            expect([res.status, res.body.code]).toEqual([403, 'CANNOT_CHANGE_OWN_ROLE']);
        }
        const row = await h.auth.prisma.user.findUniqueOrThrow({ where: { id: a.id } });
        expect([row.role, row.isSystemAdmin]).toEqual(['STUDENT', true]);
        expect(await h.adminDb.adminAudit.count({ where: { targetId: a.id, action: { startsWith: 'admin.role.' } } })).toBe(0);
    });

    it('demoting a TEACHER changes only role + authzVersion (content lives in other services and is untouched by construction)', async () => {
        const a = await makeAdmin();
        const t = await makeUser(h.auth, { role: 'TEACHER' });
        const res = await put(roleUrl(t.id), a.token, { role: 'STUDENT' });
        expect(res.status).toBe(200);
        // Their next token has no teacher permissions (the manage endpoints answer 403 on that).
        const refreshed = await request(h.auth.url).post('/api/v1/auth/refresh').send({ refreshToken: t.refreshToken });
        expect(refreshed.body.roles).toEqual(['STUDENT']);
        expect(refreshed.body.permissions).not.toContain('quizset:manage');
    });

    it('with two admins A revokes B (200); afterwards A cannot revoke themselves (403) and stays admin', async () => {
        const a = await makeAdmin();
        const b = await makeAdmin();
        await onlyAdmins(h.auth, a.id, b.id);
        const ok = await put(adminUrl(b.id), a.token, { isSystemAdmin: false, reason: 'left' });
        expect(ok.status).toBe(200);
        expect(ok.body.user.isSystemAdmin).toBe(false);
        expect(await h.adminDb.adminAudit.count({ where: { targetId: b.id, action: 'admin.role.set_system_admin' } })).toBe(1);
        const self = await put(adminUrl(a.id), a.token, { isSystemAdmin: false });
        expect([self.status, self.body.code]).toEqual([403, 'CANNOT_CHANGE_OWN_ROLE']);
        expect(await h.auth.prisma.user.count({ where: { isSystemAdmin: true, isBanned: false, deletedAt: null } })).toBe(1);
    });

    it('two admins revoking each other concurrently: exactly one 200, never zero admins', async () => {
        for (let round = 0; round < 3; round++) {
            const a = await makeAdmin();
            const b = await makeAdmin();
            await onlyAdmins(h.auth, a.id, b.id);
            const [ra, rb] = await Promise.all([
                put(adminUrl(b.id), a.token, { isSystemAdmin: false }),
                put(adminUrl(a.id), b.token, { isSystemAdmin: false }),
            ]);
            expect([ra.status, rb.status].filter((s) => s === 200)).toHaveLength(1);
            expect([ra.status, rb.status].filter((s) => s === 403 || s === 409)).toHaveLength(1);
            expect(await h.auth.prisma.user.count({ where: { isSystemAdmin: true, isBanned: false, deletedAt: null } })).toBe(1);
        }
    });

    it('a no-op change is 200 with the unchanged user and NO AdminAudit row', async () => {
        const a = await makeAdmin();
        const b = await makeUser(h.auth);
        const res = await put(roleUrl(b.id), a.token, { role: 'STUDENT' });
        expect(res.status).toBe(200);
        expect(res.body.user.role).toBe('STUDENT');
        expect((await put(adminUrl(b.id), a.token, { isSystemAdmin: false })).status).toBe(200);
        expect(await h.adminDb.adminAudit.count({ where: { targetId: b.id } })).toBe(0);
    });

    it('STUDENT and TEACHER tokens are 403 on every route (admin-service guard)', async () => {
        const student = await makeUser(h.auth);
        const teacher = await makeUser(h.auth, { role: 'TEACHER' });
        const target = await makeUser(h.auth);
        for (const u of [student, teacher]) {
            for (const [m, url, body] of [
                ['get', '/admin/roles', undefined],
                ['get', '/admin/roles/users', undefined],
                ['get', '/admin/roles/changes', undefined],
                ['put', roleUrl(target.id), { role: 'TEACHER' }],
                ['put', adminUrl(target.id), { isSystemAdmin: true }],
            ] as const) {
                const res = await h.http()[m](url).set(bearer(u.token)).send(body as object | undefined);
                expect([res.status, res.body.code]).toEqual([403, 'PERMISSION_DENIED']);
            }
        }
        expect((await h.auth.prisma.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe('STUDENT');
    });

    it('a token whose role:assign was revoked a moment ago still fails: auth re-checks the actor in the DB', async () => {
        const a = await makeAdmin();
        const b = await makeUser(h.auth);
        await h.auth.prisma.user.update({ where: { id: a.id }, data: { isSystemAdmin: false } });
        // The token still claims SYSTEM_ADMIN: admin-service lets it through, auth refuses.
        const res = await put(roleUrl(b.id), a.token, { role: 'TEACHER' });
        expect([res.status, res.body.code]).toEqual([403, 'PERMISSION_DENIED']);
        expect((await h.auth.prisma.user.findUniqueOrThrow({ where: { id: b.id } })).role).toBe('STUDENT');
        expect(await h.adminDb.adminAudit.count({ where: { targetId: b.id } })).toBe(0);
    });

    it('404 USER_NOT_FOUND, 400 VALIDATION_ERROR (role SYSTEM_ADMIN, unknown key, long reason)', async () => {
        const a = await makeAdmin();
        const nf = await put(roleUrl('does-not-exist'), a.token, { role: 'TEACHER' });
        expect([nf.status, nf.body.code]).toEqual([404, 'USER_NOT_FOUND']);
        const b = await makeUser(h.auth);
        for (const body of [{ role: 'SYSTEM_ADMIN' }, { role: 'TEACHER', extra: 1 }, { role: 'TEACHER', reason: 'x'.repeat(501) }]) {
            const res = await put(roleUrl(b.id), a.token, body);
            expect([res.status, res.body.code]).toEqual([400, 'VALIDATION_ERROR']);
        }
    });

    it('GET /admin/roles/users: filters, pagination, active systemAdminCount, no password/email leaks beyond contract', async () => {
        const a = await makeAdmin();
        const t = await makeUser(h.auth, { role: 'TEACHER' });
        await onlyAdmins(h.auth, a.id);
        const res = await h.http().get(`/admin/roles/users?q=${encodeURIComponent(t.email)}&role=TEACHER&limit=5`).set(bearer(a.token));
        expect(res.status).toBe(200);
        expect(res.body.meta).toEqual({ page: 1, limit: 5, total: 1 });
        expect(res.body.systemAdminCount).toBe(1);
        expect(Object.keys(res.body.data[0]).sort()).toEqual(
            ['avatar', 'createdAt', 'email', 'id', 'isBanned', 'isSystemAdmin', 'isVerified', 'name', 'role', 'username'].sort()
        );
        const admins = await h.http().get('/admin/roles/users?isSystemAdmin=true').set(bearer(a.token));
        expect(admins.body.data.map((u: { id: string }) => u.id)).toEqual([a.id]);
        const none = await h.http().get('/admin/roles/users?q=zzzz-no-such-user').set(bearer(a.token));
        expect([none.body.data, none.body.meta.total]).toEqual([[], 0]);
    });

    it('GET /admin/roles/changes lists the history with email snapshots and source, filterable by user', async () => {
        const a = await makeAdmin();
        const b = await makeUser(h.auth);
        await put(roleUrl(b.id), a.token, { role: 'TEACHER', reason: 'r1' });
        await put(adminUrl(b.id), a.token, { isSystemAdmin: true });
        const res = await h.http().get(`/admin/roles/changes?userId=${b.id}`).set(bearer(a.token));
        expect(res.status).toBe(200);
        expect(res.body.meta.total).toBe(2);
        expect(res.body.data[0]).toMatchObject({
            targetUserId: b.id, targetEmail: b.email, actorUserId: a.id, actorEmail: a.email,
            fromRole: 'TEACHER', toRole: 'TEACHER', fromAdmin: false, toAdmin: true, source: 'admin-ui',
        });
        expect(res.body.data[1]).toMatchObject({ fromRole: 'STUDENT', toRole: 'TEACHER', reason: 'r1' });
    });

    it('GET /admin/roles is the catalog from code (3 roles, 29 permissions)', async () => {
        const a = await makeAdmin();
        const res = await h.http().get('/admin/roles').set(bearer(a.token));
        expect(res.status).toBe(200);
        expect(res.body.roles.map((r: { key: string }) => r.key)).toEqual(['STUDENT', 'TEACHER', 'SYSTEM_ADMIN']);
        expect(res.body.permissions).toHaveLength(29);
    });
});
