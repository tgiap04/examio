import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import {
    AuthApp,
    PASSWORD,
    bootAuthApp,
    loginVerified,
    registerUser,
    uniq,
} from '../../auth-service/test/helpers/auth-app';

/**
 * admin-service -> auth-service over REAL gRPC and a real Postgres: admin
 * privilege changes go through auth `SetSystemAdmin` (advisory lock, last-admin
 * guard, RoleChangeLog, authzVersion, outbox) with the calling admin's own
 * access token as metadata. No guard or client is mocked.
 */
describe('admin users: system-admin changes go through auth (e2e)', () => {
    let auth: AuthApp;
    let admin: INestApplication;

    beforeAll(async () => {
        auth = await bootAuthApp({ grpc: true });
        process.env.AUTH_JWKS_URL = `${auth.url}/.well-known/jwks.json`;
        process.env.AUTH_GRPC_URL = auth.grpcUrl as string;
        const { AdminServiceModule } = await import('../src/admin-service.module');
        const moduleRef = await Test.createTestingModule({ imports: [AdminServiceModule] }).compile();
        admin = moduleRef.createNestApplication();
        await admin.init();
    });
    afterAll(async () => {
        await Promise.race([admin?.close(), new Promise((r) => setTimeout(r, 5000))]);
        await auth.close();
    });

    async function makeAdmin() {
        const u = await registerUser(auth);
        await auth.prisma.user.update({ where: { id: u.id }, data: { isSystemAdmin: true } });
        const login = await loginVerified(auth, u.email);
        return { ...u, token: login.body.token as string };
    }
    /** Leave exactly these users as the active admins (the DB is shared by the suites). */
    async function onlyAdmins(...ids: string[]) {
        await auth.prisma.user.updateMany({ where: { isSystemAdmin: true, id: { notIn: ids } }, data: { isSystemAdmin: false } });
        await auth.prisma.user.updateMany({ where: { id: { in: ids } }, data: { isSystemAdmin: true, isBanned: false } });
    }
    const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
    const http = () => request(admin.getHttpServer());

    it('PATCH /admin/users/:id with isSystemAdmin is 400 (no last-admin bypass) and changes nothing', async () => {
        const sole = await makeAdmin();
        await onlyAdmins(sole.id);
        const other = await registerUser(auth);
        for (const id of [sole.id, other.id]) {
            const res = await http().patch(`/admin/users/${id}`).set(bearer(sole.token)).send({ isSystemAdmin: false });
            expect(res.status).toBe(400);
        }
        const res = await http().patch(`/admin/users/${other.id}`).set(bearer(sole.token)).send({ isSystemAdmin: true });
        expect(res.status).toBe(400);
        expect((await auth.prisma.user.findUniqueOrThrow({ where: { id: sole.id } })).isSystemAdmin).toBe(true);
        expect((await auth.prisma.user.findUniqueOrThrow({ where: { id: other.id } })).isSystemAdmin).toBe(false);
        // The other mutable fields still work.
        await http().patch(`/admin/users/${other.id}`).set(bearer(sole.token)).send({ name: 'Renamed' }).expect(200);
    });

    it('the sole admin cannot revoke themselves: 403 CANNOT_CHANGE_OWN_ROLE from auth, still an admin', async () => {
        const sole = await makeAdmin();
        await onlyAdmins(sole.id);
        const res = await http().post(`/admin/users/${sole.id}/revoke-admin`).set(bearer(sole.token));
        expect([res.status, res.body.code]).toEqual([403, 'CANNOT_CHANGE_OWN_ROLE']);
        expect((await auth.prisma.user.findUniqueOrThrow({ where: { id: sole.id } })).isSystemAdmin).toBe(true);
    });

    it('two admins revoking each other concurrently never leave zero admins (one 200, the other 403/409)', async () => {
        for (let round = 0; round < 3; round++) {
            const a = await makeAdmin();
            const b = await makeAdmin();
            await onlyAdmins(a.id, b.id);
            const [ra, rb] = await Promise.all([
                http().post(`/admin/users/${b.id}/revoke-admin`).set(bearer(a.token)),
                http().post(`/admin/users/${a.id}/revoke-admin`).set(bearer(b.token)),
            ]);
            expect([ra.status, rb.status].filter((s) => s === 200)).toHaveLength(1);
            expect([ra.status, rb.status].filter((s) => s === 403 || s === 409)).toHaveLength(1);
            expect(await auth.prisma.user.count({ where: { isSystemAdmin: true, isBanned: false, deletedAt: null } })).toBe(1);
        }
    });

    it('grant-admin: auth writes RoleChangeLog (actor from the token), bumps authzVersion, emits one authz_changed; admin keeps its AdminAudit row', async () => {
        const actor = await makeAdmin();
        const target = await registerUser(auth);
        const before = await auth.prisma.user.findUniqueOrThrow({ where: { id: target.id } });

        const res = await http().post(`/admin/users/${target.id}/grant-admin`).set(bearer(actor.token));
        expect(res.status).toBe(200);
        expect(res.body.user).toMatchObject({ id: target.id, isSystemAdmin: true });

        const after = await auth.prisma.user.findUniqueOrThrow({ where: { id: target.id } });
        expect(after.isSystemAdmin).toBe(true);
        expect(after.authzVersion).toBe(before.authzVersion + 1);
        const logs = await auth.prisma.roleChangeLog.findMany({ where: { targetUserId: target.id } });
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({ actorUserId: actor.id, fromAdmin: false, toAdmin: true, source: 'admin-ui' });
        const events = await auth.prisma.outboxEvent.findMany({
            where: { type: 'auth.user.authz_changed', envelope: { path: ['data', 'userId'], equals: target.id } },
        });
        expect(events).toHaveLength(1);
        expect((events[0].envelope as { data: { reason: string } }).data.reason).toBe('admin');
        const audit = await auth.prisma.adminAudit.findFirst({ where: { targetId: target.id, action: 'admin.user.grant' } });
        expect(audit).toMatchObject({ adminId: actor.id });
        expect(audit?.payload).toMatchObject({ from: false, to: true });
    });

    it('revoke-admin of another admin goes through auth too (log + av bump + audit)', async () => {
        const actor = await makeAdmin();
        const target = await makeAdmin();
        const res = await http().post(`/admin/users/${target.id}/revoke-admin`).set(bearer(actor.token));
        expect(res.status).toBe(200);
        expect(res.body.user.isSystemAdmin).toBe(false);
        const log = await auth.prisma.roleChangeLog.findFirstOrThrow({ where: { targetUserId: target.id }, orderBy: { createdAt: 'desc' } });
        expect(log).toMatchObject({ actorUserId: actor.id, fromAdmin: true, toAdmin: false });
        expect(await auth.prisma.adminAudit.count({ where: { targetId: target.id, action: 'admin.user.revoke' } })).toBe(1);
    });

    it('a banned user cannot be granted admin; an unknown user is 404; a non-admin caller is refused', async () => {
        const actor = await makeAdmin();
        const banned = await registerUser(auth);
        await auth.prisma.user.update({ where: { id: banned.id }, data: { isBanned: true } });
        expect((await http().post(`/admin/users/${banned.id}/grant-admin`).set(bearer(actor.token))).status).toBe(404);
        expect((await http().post(`/admin/users/${uniq('nope')}/grant-admin`).set(bearer(actor.token))).status).toBe(404);

        const plain = await registerUser(auth);
        const login = await loginVerified(auth, plain.email);
        expect((await http().post(`/admin/users/${banned.id}/grant-admin`).set(bearer(login.body.token))).status).toBe(403);
        expect(PASSWORD).toBeDefined();
    });
});
