import { HttpException, Logger } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { AdminUsersService } from './admin-users.service';

const row = (over: Record<string, unknown> = {}) => ({
    id: 'u1', email: 'u1@x.io', username: 'u1', name: '', avatar: '', role: 1, isSystemAdmin: false,
    isVerified: true, isBanned: false, createdAt: '1700000000000', updatedAt: '1700000001000', ...over,
});
const ctx = { adminId: 'admin1', ipAddress: '1.1.1.1', userAgent: 'jest' };
const md = new Metadata();
md.set('authorization', 'Bearer admin-token');

/** `existing` = what auth GetUser returns before the change, `after` = SetUserStatus result. */
function setup(opts: { existing?: ReturnType<typeof row> | null; after?: ReturnType<typeof row> } = {}) {
    const auth = {
        getUser: jest.fn(async () => {
            if (opts.existing === null) throw new HttpException({ statusCode: 404, code: 'NOT_FOUND', message: 'nope' }, 404);
            return { user: opts.existing ?? row() };
        }),
        setUserStatus: jest.fn(async () => ({ user: opts.after ?? row({ isBanned: true }) })),
    };
    const audit = { write: jest.fn(async () => undefined) };
    const service = new AdminUsersService(audit as never, auth as never, {} as never, {} as never);
    return { service, auth, audit };
}
const httpErr = (status: number, code: string) =>
    new HttpException({ statusCode: status, code, message: code }, status);

describe('AdminUsersService ban / unban go through auth SetUserStatus', () => {
    it('banUser: RPC with the admin token, then ONE admin.user.ban audit row; no direct User write', async () => {
        const { service, auth, audit } = setup();
        const user = await service.banUser('u1', ctx, md);
        expect(auth.getUser).toHaveBeenCalledWith('u1', md);
        expect(auth.setUserStatus).toHaveBeenCalledWith('u1', true, md);
        expect(user).toMatchObject({ id: 'u1', isBanned: true });
        expect(audit.write).toHaveBeenCalledTimes(1);
        expect(audit.write).toHaveBeenCalledWith(
            expect.objectContaining({ adminId: 'admin1', action: 'admin.user.ban', targetId: 'u1', payload: { previousIsBanned: false } })
        );
    });

    it('unbanUser: SetUserStatus(is_banned=false) and admin.user.unban audit', async () => {
        const { service, auth, audit } = setup({ existing: row({ isBanned: true }), after: row({ isBanned: false }) });
        await service.unbanUser('u1', ctx, md);
        expect(auth.setUserStatus).toHaveBeenCalledWith('u1', false, md);
        expect(audit.write).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'admin.user.unban', payload: { previousIsBanned: true } })
        );
    });

    it.each([
        ['LAST_SYSTEM_ADMIN', 409],
        ['CANNOT_CHANGE_OWN_STATUS', 403],
        ['PERMISSION_DENIED', 403],
        ['ROLE_CHANGE_CONFLICT', 409],
    ])('auth %s (%i) propagates unchanged and writes no audit', async (code, status) => {
        const { service, auth, audit } = setup();
        auth.setUserStatus.mockRejectedValue(httpErr(status, code));
        const err = await service.banUser('u1', ctx, md).catch((e) => e);
        expect([err.getStatus(), err.getResponse().code]).toEqual([status, code]);
        expect(audit.write).not.toHaveBeenCalled();
    });

    it('the audit write is best-effort: it throws after the committed RPC -> still returns the banned user, error logged with userId and action', async () => {
        const { service, audit, auth } = setup();
        audit.write.mockRejectedValue(new Error('audit db down'));
        const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const user = await service.banUser('u1', ctx, md);
        expect(auth.setUserStatus).toHaveBeenCalledTimes(1);
        expect(user).toMatchObject({ id: 'u1', isBanned: true });
        expect(logged).toHaveBeenCalledTimes(1);
        const msg = String(logged.mock.calls[0][0]);
        expect(msg).toContain('u1');
        expect(msg).toContain('admin.user.ban');
        expect(msg).toContain('audit db down');
        logged.mockRestore();
    });

    it('an unknown user is the RPC\'s 404: no audit row', async () => {
        const { service, auth, audit } = setup({ existing: null });
        auth.setUserStatus.mockRejectedValue(httpErr(404, 'NOT_FOUND'));
        await expect(service.banUser('nope', ctx, md)).rejects.toMatchObject({ status: 404 });
        expect(audit.write).not.toHaveBeenCalled();
    });

    it('a legacy soft-deleted account (invisible to GetUser) can still be unbanned; previous state is inferred', async () => {
        const { service, auth, audit } = setup({ existing: null, after: row({ isBanned: false }) });
        await service.unbanUser('legacy', ctx, md);
        expect(auth.setUserStatus).toHaveBeenCalledWith('legacy', false, md);
        expect(audit.write).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'admin.user.unban', payload: { previousIsBanned: true } })
        );
    });

    it('a non-404 failure of the previous-state read is not swallowed', async () => {
        const { service, auth } = setup();
        auth.getUser.mockRejectedValue(httpErr(503, 'SERVICE_UNAVAILABLE'));
        await expect(service.banUser('u1', ctx, md)).rejects.toMatchObject({ status: 503 });
        expect(auth.setUserStatus).not.toHaveBeenCalled();
    });
});
