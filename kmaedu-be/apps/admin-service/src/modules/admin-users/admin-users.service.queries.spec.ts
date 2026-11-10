import { HttpException } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { AdminUsersService } from './admin-users.service';
import { userSelectSafe } from './user-select.safe';

const protoUser = (over: Record<string, unknown> = {}) => ({
    id: 'u1', email: 'u1@x.io', username: 'u1', name: 'U', avatar: '', role: 1, isSystemAdmin: false,
    isVerified: false, isBanned: false, createdAt: '1700000000000', updatedAt: '1700000002000', bio: 'b', ...over,
});
const md = new Metadata();
md.set('authorization', 'Bearer admin-token');
const ctx = { adminId: 'admin1', ipAddress: '9.9.9.9', userAgent: 'jest' };
const q = (over: Record<string, unknown> = {}) => ({ page: 1, pageSize: 20, ...over });

function setup() {
    const auth = {
        listUsers: jest.fn(async () => ({ users: [protoUser()], page: { total: 1, page: 1, limit: 20 } })),
        getUser: jest.fn(async () => ({ user: protoUser() })),
    };
    const authUsers = { getUserAdminDetail: jest.fn(), updateUserAdmin: jest.fn() };
    const audit = { write: jest.fn(async () => undefined) };
    const service = new AdminUsersService(audit as never, auth as never, authUsers as never);
    return { service, auth, authUsers, audit };
}

describe('AdminUsersService.listUsers (auth ListUsers with the admin token)', () => {
    it('maps the query to the RPC, keeps the safe row shape (no password) and the page meta', async () => {
        const { service, auth } = setup();
        const res = await service.listUsers(q({ page: 3, pageSize: 10 }) as never, md);
        expect(auth.listUsers).toHaveBeenCalledWith(
            expect.objectContaining({ query: '', page: 3, limit: 10 }),
            md
        );
        expect(res).toMatchObject({ total: 1, page: 3, pageSize: 10 });
        expect(Object.keys(res.rows[0]).sort()).toEqual(Object.keys(userSelectSafe).sort());
        expect(res.rows[0]).toMatchObject({ id: 'u1', name: 'U', role: 'STUDENT', deletedAt: null });
        expect(res.rows[0].createdAt).toEqual(new Date(1_700_000_000_000));
    });

    it('maps every filter, including the created range as epoch ms', async () => {
        const { service, auth } = setup();
        await service.listUsers(
            q({ search: 'ab', isSystemAdmin: true, isVerified: false, isBanned: true, createdFrom: '2026-01-01T00:00:00.000Z', createdTo: '2026-02-01T00:00:00.000Z' }) as never,
            md
        );
        expect(auth.listUsers).toHaveBeenCalledWith(
            {
                query: 'ab', isSystemAdmin: true, isVerified: false, isBanned: true,
                createdFrom: String(Date.parse('2026-01-01T00:00:00.000Z')),
                createdTo: String(Date.parse('2026-02-01T00:00:00.000Z')),
                page: 1, limit: 20,
            },
            md
        );
    });
});

describe('AdminUsersService.getUserDetail', () => {
    it('returns auth detail (user + last session) in one RPC with no finance fields', async () => {
        const { service, authUsers } = setup();
        authUsers.getUserAdminDetail.mockResolvedValue({
            user: protoUser(),
            lastSession: { id: 'ses', ipAddress: '1.1.1.1', browser: 'b', lastActivity: '0', isActive: true },
        });
        const res = await service.getUserDetail('u1', md);
        expect(authUsers.getUserAdminDetail).toHaveBeenCalledWith('u1', md);
        expect(Object.keys(res).sort()).toEqual(['lastSession', 'user']);
        expect(res.lastSession).toMatchObject({ id: 'ses', ipAddress: '1.1.1.1', deviceName: null, lastActivity: new Date(0) });
    });

    it('null lastSession for a user without a session; an auth 404 propagates', async () => {
        const { service, authUsers } = setup();
        authUsers.getUserAdminDetail.mockResolvedValueOnce({ user: protoUser(), lastSession: undefined });
        expect(await service.getUserDetail('u1', md)).toMatchObject({ lastSession: null });
        authUsers.getUserAdminDetail.mockRejectedValueOnce(new HttpException({ statusCode: 404, code: 'NOT_FOUND' }, 404));
        await expect(service.getUserDetail('nope', md)).rejects.toMatchObject({ status: 404 });
    });
});

describe('AdminUsersService.updateUser (auth UpdateUserAdmin with the admin token)', () => {
    it('sends only changed fields and writes one audit row per field after auth committed', async () => {
        const { service, authUsers, audit } = setup();
        authUsers.updateUserAdmin.mockResolvedValue({ user: protoUser({ name: 'New', isVerified: true }) });
        const res = await service.updateUser('u1', { name: 'New', bio: 'b', isVerified: true }, ctx, md);
        expect(res.changedFields).toEqual(['isVerified', 'name']);
        expect(authUsers.updateUserAdmin).toHaveBeenCalledWith({ userId: 'u1', isVerified: true, name: 'New' }, md);
        expect(audit.write.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
            { adminId: 'admin1', action: 'admin.user.update', targetId: 'u1', payload: { field: 'isVerified', from: false, to: true }, ipAddress: '9.9.9.9', userAgent: 'jest' },
            { adminId: 'admin1', action: 'admin.user.update', targetId: 'u1', payload: { field: 'name', from: 'U', to: 'New' }, ipAddress: '9.9.9.9', userAgent: 'jest' },
        ]);
    });

    it('a no-op body makes no write RPC and no audit', async () => {
        const { service, authUsers, audit } = setup();
        const res = await service.updateUser('u1', { name: 'U' }, ctx, md);
        expect(res.changedFields).toEqual([]);
        expect(authUsers.updateUserAdmin).not.toHaveBeenCalled();
        expect(audit.write).not.toHaveBeenCalled();
    });

    it('an unknown user is 404 before any write, and a failing write RPC leaves no audit', async () => {
        const { service, auth, authUsers, audit } = setup();
        auth.getUser.mockRejectedValueOnce(new HttpException({ statusCode: 404, code: 'NOT_FOUND' }, 404));
        await expect(service.updateUser('nope', { name: 'x' }, ctx, md)).rejects.toMatchObject({ status: 404 });
        authUsers.updateUserAdmin.mockRejectedValueOnce(new HttpException({ statusCode: 503, code: 'SERVICE_UNAVAILABLE' }, 503));
        await expect(service.updateUser('u1', { name: 'x' }, ctx, md)).rejects.toMatchObject({ status: 503 });
        expect(audit.write).not.toHaveBeenCalled();
    });
});
