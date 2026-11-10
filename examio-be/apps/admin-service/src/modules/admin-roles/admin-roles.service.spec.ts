import { HttpException, Logger } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { authV1 } from '@examio/contracts';
import { AdminRolesService } from './admin-roles.service';

const user = (over: Partial<authV1.User> = {}): authV1.User => ({
    id: 'u1', email: 'u1@x.io', username: 'u1', name: 'U', avatar: '',
    role: authV1.BaseRole.BASE_ROLE_STUDENT, isSystemAdmin: false, isVerified: true, isBanned: false,
    createdAt: String(Date.UTC(2026, 9, 17, 8)), updatedAt: String(Date.UTC(2026, 9, 17, 9)), ...over,
});
const TEACHER = authV1.BaseRole.BASE_ROLE_TEACHER;
const ctx = { adminId: 'admin1', ipAddress: '1.2.3.4', userAgent: 'jest' };
const md = new Metadata();
md.set('authorization', 'Bearer admin-token');

function setup() {
    const auth = {
        getUser: jest.fn(async () => ({ user: user() })),
        listUsers: jest.fn(async (_req: unknown, _md?: unknown) => ({ users: [user()], page: { total: 1, page: 1, limit: 20 } })),
        setUserRole: jest.fn(async (_id: string, role: authV1.BaseRole) => ({ user: user({ role }) })),
        setSystemAdmin: jest.fn(async (_id: string, isSystemAdmin: boolean) => ({ user: user({ isSystemAdmin }) })),
        listRoleChanges: jest.fn(async (_req: unknown, _md?: unknown) => ({ changes: [] as authV1.RoleChange[], page: { total: 0, page: 1, limit: 20 } })),
    };
    const audit = { write: jest.fn(async () => undefined) };
    return { auth, audit, service: new AdminRolesService(auth as never, audit as never) };
}
const httpErr = (status: number, code: string) =>
    new HttpException({ statusCode: status, code, message: code }, status);

describe('AdminRolesService', () => {
    it('matrix is the code catalog: three roles, every permission once', () => {
        const m = setup().service.matrix();
        expect(m.roles.map((r) => r.key)).toEqual(['STUDENT', 'TEACHER', 'SYSTEM_ADMIN']);
        expect(m.permissions).toHaveLength(29);
        expect(m.roles[2].permissions).toContain('admin:access');
    });

    it('listUsers: one page call + one active-admin count call (parallel), contract shape', async () => {
        const { service, auth } = setup();
        auth.listUsers.mockResolvedValueOnce({ users: [user({ avatar: '' })], page: { total: 134, page: 2, limit: 20 } });
        auth.listUsers.mockResolvedValueOnce({ users: [], page: { total: 2, page: 1, limit: 1 } });
        const res = await service.listUsers({ q: 'a', role: 'TEACHER', isSystemAdmin: false, page: 2, limit: 20 }, md);
        expect(auth.listUsers).toHaveBeenCalledTimes(2);
        expect(auth.listUsers.mock.calls[0][0]).toMatchObject({ query: 'a', role: TEACHER, isSystemAdmin: false, page: 2, limit: 20 });
        expect(auth.listUsers.mock.calls[1][0]).toMatchObject({ isSystemAdmin: true, isBanned: false, page: 1, limit: 1 });
        expect(res.meta).toEqual({ page: 2, limit: 20, total: 134 });
        expect(res.systemAdminCount).toBe(2);
        expect(res.data[0]).toEqual({
            id: 'u1', email: 'u1@x.io', username: 'u1', name: 'U', avatar: null, role: 'STUDENT',
            isSystemAdmin: false, isBanned: false, isVerified: true, createdAt: '2026-10-17T08:00:00.000Z',
        });
    });

    it('every RPC carries the CALLER metadata unchanged', async () => {
        const { service, auth } = setup();
        await service.listUsers({ page: 1, limit: 20 }, md);
        await service.setRole('u1', { role: 'TEACHER' }, ctx, md);
        await service.setSystemAdmin('u1', { isSystemAdmin: true }, ctx, md);
        await service.listChanges({ page: 1, limit: 20 }, md);
        const metadataArgs = [
            ...auth.listUsers.mock.calls.map((c) => (c as unknown[])[1]),
            (auth.setUserRole.mock.calls[0] as unknown[])[3],
            (auth.setSystemAdmin.mock.calls[0] as unknown[])[2],
            (auth.listRoleChanges.mock.calls[0] as unknown[])[1],
        ];
        for (const m of metadataArgs) expect(m).toBe(md);
    });

    it('setRole success: RPC then ONE audit row admin.role.set_base {from,to,reason} with IP/UA', async () => {
        const { service, auth, audit } = setup();
        const res = await service.setRole('u1', { role: 'TEACHER', reason: 'Giáo viên khối 10' }, ctx, md);
        expect(auth.setUserRole).toHaveBeenCalledWith('u1', TEACHER, 'Giáo viên khối 10', md);
        expect(res.user.role).toBe('TEACHER');
        expect(audit.write).toHaveBeenCalledTimes(1);
        expect(audit.write).toHaveBeenCalledWith({
            adminId: 'admin1', action: 'admin.role.set_base', targetId: 'u1',
            payload: { from: 'STUDENT', to: 'TEACHER', reason: 'Giáo viên khối 10' },
            ipAddress: '1.2.3.4', userAgent: 'jest',
        });
    });

    it('setSystemAdmin success writes admin.role.set_system_admin', async () => {
        const { service, audit } = setup();
        await service.setSystemAdmin('u1', { isSystemAdmin: true }, ctx, md);
        expect(audit.write).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'admin.role.set_system_admin',
                payload: { from: false, to: true, reason: null },
            })
        );
    });

    it('a no-op change returns the unchanged user and writes NO audit row', async () => {
        const { service, audit } = setup();
        const res = await service.setRole('u1', { role: 'STUDENT' }, ctx, md);
        expect(res.user.role).toBe('STUDENT');
        expect(audit.write).not.toHaveBeenCalled();
        await service.setSystemAdmin('u1', { isSystemAdmin: false }, ctx, md);
        expect(audit.write).not.toHaveBeenCalled();
    });

    it.each([
        ['PERMISSION_DENIED', 403],
        ['CANNOT_CHANGE_OWN_ROLE', 403],
        ['LAST_SYSTEM_ADMIN', 409],
        ['ROLE_CHANGE_CONFLICT', 409],
        ['USER_NOT_FOUND', 404],
    ])('auth %s (%i) reaches the caller unchanged and writes no audit', async (code, status) => {
        const { service, auth, audit } = setup();
        auth.setSystemAdmin.mockRejectedValue(httpErr(status, code));
        auth.setUserRole.mockRejectedValue(httpErr(status, code));
        for (const run of [
            () => service.setRole('u1', { role: 'TEACHER' }, ctx, md),
            () => service.setSystemAdmin('u1', { isSystemAdmin: false }, ctx, md),
        ]) {
            const err = await run().catch((e) => e);
            expect(err).toBeInstanceOf(HttpException);
            expect([err.getStatus(), err.getResponse().code]).toEqual([status, code]);
        }
        expect(audit.write).not.toHaveBeenCalled();
    });

    it('audit failures after a committed role/admin change are logged, never thrown', async () => {
        const { service, audit } = setup();
        audit.write.mockRejectedValue(new Error('audit db down'));
        const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const role = await service.setRole('u1', { role: 'TEACHER' }, ctx, md);
        const admin = await service.setSystemAdmin('u1', { isSystemAdmin: true }, ctx, md);
        expect(role.user.role).toBe('TEACHER');
        expect(admin.user.isSystemAdmin).toBe(true);
        expect(logged).toHaveBeenCalledTimes(2);
        const msgs = logged.mock.calls.map((c) => String(c[0]));
        expect(msgs[0]).toContain('admin.role.set_base');
        expect(msgs[1]).toContain('admin.role.set_system_admin');
        expect(msgs.every((m) => m.includes('u1'))).toBe(true);
        logged.mockRestore();
    });

    it('an unknown user is 404 USER_NOT_FOUND before any write', async () => {
        const { service, auth, audit } = setup();
        auth.getUser.mockRejectedValue(httpErr(404, 'NOT_FOUND'));
        for (const run of [
            () => service.setRole('nope', { role: 'TEACHER' }, ctx, md),
            () => service.setSystemAdmin('nope', { isSystemAdmin: true }, ctx, md),
        ]) {
            const err = await run().catch((e) => e);
            expect([err.getStatus(), err.getResponse().code]).toEqual([404, 'USER_NOT_FOUND']);
        }
        expect(auth.setUserRole).not.toHaveBeenCalled();
        expect(audit.write).not.toHaveBeenCalled();
    });

    it('listChanges maps snapshots, source and CLI actors; filters by userId', async () => {
        const { service, auth } = setup();
        auth.listRoleChanges.mockResolvedValue({
            changes: [{
                id: 'c1', targetUserId: 't1', changedBy: 'cli@system', fromRole: 1, toRole: TEACHER,
                fromIsSystemAdmin: false, toIsSystemAdmin: false, reason: '', createdAt: String(Date.UTC(2026, 9, 17, 8, 5)),
                targetEmail: 'b@x.io', actorEmail: 'cli@system', source: 'cli',
            }],
            page: { total: 9, page: 1, limit: 20 },
        });
        const res = await service.listChanges({ userId: 't1', page: 1, limit: 20 }, md);
        expect(auth.listRoleChanges.mock.calls[0][0]).toEqual({ targetUserId: 't1', page: 1, limit: 20 });
        expect(res.meta.total).toBe(9);
        expect(res.data[0]).toEqual({
            id: 'c1', targetUserId: 't1', targetEmail: 'b@x.io', actorUserId: null, actorEmail: 'cli@system',
            fromRole: 'STUDENT', toRole: 'TEACHER', fromAdmin: false, toAdmin: false, reason: null,
            source: 'cli', createdAt: '2026-10-17T08:05:00.000Z',
        });
    });
});
