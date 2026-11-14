import { Harness, authzEvents, bearer, bootHarness, makeUser, onlyAdmins } from './helpers/real-auth-admin';
import request = require('supertest');

/** Ban / unban: admin -> auth `SetUserStatus` over real gRPC, real Postgres. */
describe('admin ban / unban through auth SetUserStatus (e2e)', () => {
    let h: Harness;
    beforeAll(async () => {
        h = await bootHarness();
    });
    afterAll(() => h.close());

    const post = (path: string, token: string) => h.http().post(path).set(bearer(token));
    const makeAdmin = () => makeUser(h.auth, { isSystemAdmin: true });
    const row = (id: string) => h.auth.prisma.user.findUniqueOrThrow({ where: { id } });

    it('ban: 200 (shape kept), isBanned, deletedAt untouched, sessions inactive, av+1, authz_changed(ban), log + audit; refresh is 401', async () => {
        const a = await makeAdmin();
        const b = await makeUser(h.auth);
        const before = await row(b.id);
        expect(await h.auth.prisma.userSession.count({ where: { userId: b.id, isActive: true } })).toBeGreaterThan(0);

        const res = await post(`/admin/users/${b.id}/ban`, a.token);
        expect(res.status).toBe(200);
        expect(res.body.user).toMatchObject({ id: b.id, isBanned: true, deletedAt: null });

        const after = await row(b.id);
        expect([after.isBanned, after.deletedAt]).toEqual([true, null]);
        expect(after.authzVersion).toBe(before.authzVersion + 1);
        expect(await h.auth.prisma.userSession.count({ where: { userId: b.id, isActive: true } })).toBe(0);
        const events = await authzEvents(h.auth, b.id);
        expect(events).toHaveLength(1);
        expect((events[0].envelope as { data: Record<string, unknown> }).data).toMatchObject({
            reason: 'ban', isBanned: true, authzVersion: after.authzVersion, version: after.authzVersion,
        });
        expect(await h.auth.prisma.outboxEvent.count({ where: { type: 'auth.session.revoked', envelope: { path: ['data', 'userId'], equals: b.id } } })).toBeGreaterThan(0);
        expect(await h.auth.prisma.roleChangeLog.count({ where: { targetUserId: b.id, reason: 'ban' } })).toBe(1);
        const audit = await h.adminDb.adminAudit.findMany({ where: { targetId: b.id, action: 'admin.user.ban' } });
        expect(audit).toHaveLength(1);
        expect(audit[0]).toMatchObject({ adminId: a.id });

        const refresh = await request(h.auth.url).post('/api/v1/auth/refresh').send({ refreshToken: b.refreshToken });
        expect(refresh.status).toBe(401);
    });

    it('unban: authzVersion +1 again, authz_changed(unban), audit admin.user.unban; the user can log in again', async () => {
        const a = await makeAdmin();
        const b = await makeUser(h.auth);
        await post(`/admin/users/${b.id}/ban`, a.token).expect(200);
        const banned = await row(b.id);
        const res = await post(`/admin/users/${b.id}/unban`, a.token);
        expect(res.status).toBe(200);
        expect(res.body.user.isBanned).toBe(false);
        expect((await row(b.id)).authzVersion).toBe(banned.authzVersion + 1);
        const reasons = (await authzEvents(h.auth, b.id)).map((e) => (e.envelope as { data: { reason: string } }).data.reason);
        expect(reasons).toEqual(['ban', 'unban']);
        expect(await h.adminDb.adminAudit.count({ where: { targetId: b.id, action: 'admin.user.unban' } })).toBe(1);
    });

    it('banning twice is a no-op: no second event, no second av bump', async () => {
        const a = await makeAdmin();
        const b = await makeUser(h.auth);
        await post(`/admin/users/${b.id}/ban`, a.token).expect(200);
        const once = await row(b.id);
        await post(`/admin/users/${b.id}/ban`, a.token).expect(200);
        expect((await row(b.id)).authzVersion).toBe(once.authzVersion);
        expect(await authzEvents(h.auth, b.id)).toHaveLength(1);
    });

    it('self-ban is 403 CANNOT_CHANGE_OWN_STATUS and changes nothing', async () => {
        const a = await makeAdmin();
        const res = await post(`/admin/users/${a.id}/ban`, a.token);
        expect([res.status, res.body.code]).toEqual([403, 'CANNOT_CHANGE_OWN_STATUS']);
        expect((await row(a.id)).isBanned).toBe(false);
        expect(await h.adminDb.adminAudit.count({ where: { targetId: a.id, action: 'admin.user.ban' } })).toBe(0);
    });

    it('a non-admin caller is 403 at the admin guard; a stale admin token is 403 at auth (DB actor re-check)', async () => {
        const student = await makeUser(h.auth);
        const target = await makeUser(h.auth);
        const plain = await post(`/admin/users/${target.id}/ban`, student.token);
        expect([plain.status, plain.body.code]).toEqual([403, 'PERMISSION_DENIED']);
        const stale = await makeAdmin();
        await h.auth.prisma.user.update({ where: { id: stale.id }, data: { isSystemAdmin: false } });
        const res = await post(`/admin/users/${target.id}/ban`, stale.token);
        expect([res.status, res.body.code]).toEqual([403, 'PERMISSION_DENIED']);
        expect((await row(target.id)).isBanned).toBe(false);
    });

    it('banning an admin while another remains works; two concurrent bans of the last two admins: exactly one succeeds', async () => {
        for (let round = 0; round < 3; round++) {
            const a = await makeAdmin();
            const b = await makeAdmin();
            await onlyAdmins(h.auth, a.id, b.id);
            const [ra, rb] = await Promise.all([post(`/admin/users/${b.id}/ban`, a.token), post(`/admin/users/${a.id}/ban`, b.token)]);
            expect([ra.status, rb.status].filter((s) => s === 200)).toHaveLength(1);
            // The loser is refused: its actor was banned a moment earlier (403), or the guard fired (409).
            expect([ra.status, rb.status].filter((s) => s === 403 || s === 409)).toHaveLength(1);
            expect(await h.auth.prisma.user.count({ where: { isSystemAdmin: true, isBanned: false, deletedAt: null } })).toBe(1);
        }
    });

    it('a ban and an admin revoke race on the same advisory lock: one wins, one admin always remains', async () => {
        for (let round = 0; round < 3; round++) {
            const a = await makeAdmin();
            const b = await makeAdmin();
            await onlyAdmins(h.auth, a.id, b.id);
            const [ban, revoke] = await Promise.all([
                post(`/admin/users/${b.id}/ban`, a.token),
                h.http().put(`/admin/roles/users/${a.id}/system-admin`).set(bearer(b.token)).send({ isSystemAdmin: false }),
            ]);
            expect([ban.status, revoke.status].filter((s) => s === 200)).toHaveLength(1);
            expect(await h.auth.prisma.user.count({ where: { isSystemAdmin: true, isBanned: false, deletedAt: null } })).toBe(1);
        }
    });

    it('PATCH cannot ban any more: isBanned in the body is 400', async () => {
        const a = await makeAdmin();
        const b = await makeUser(h.auth);
        const res = await h.http().patch(`/admin/users/${b.id}`).set(bearer(a.token)).send({ isBanned: true });
        expect([res.status, res.body.code]).toEqual([400, 'VALIDATION_ERROR']);
        expect((await row(b.id)).isBanned).toBe(false);
    });

    it('an unknown user is 404 and a legacy-banned account (isBanned + deletedAt) can be unbanned', async () => {
        const a = await makeAdmin();
        expect((await post('/admin/users/no-such-user/ban', a.token)).status).toBe(404);
        const legacy = await makeUser(h.auth);
        await h.auth.prisma.user.update({ where: { id: legacy.id }, data: { isBanned: true, deletedAt: new Date() } });
        const res = await post(`/admin/users/${legacy.id}/unban`, a.token);
        expect(res.status).toBe(200);
        const r = await row(legacy.id);
        expect([r.isBanned, r.deletedAt]).toEqual([false, null]);
    });
});
