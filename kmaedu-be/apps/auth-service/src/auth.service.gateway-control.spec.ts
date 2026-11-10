import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

/** Gateway revoke / invalidate hooks of logout, reset-password and change-password. */
function setup() {
    const user = { id: 'u1', email: 'a@b.c', password: 'old-hash', username: 'u' };
    const updated = { id: 'u1', authzVersion: 5, role: 'STUDENT', isSystemAdmin: false, isBanned: false };
    const tx = {
        user: { update: jest.fn().mockResolvedValue(updated) },
        resetPasswordCode: { delete: jest.fn() },
    };
    const prisma = {
        resetPasswordCode: { findUnique: jest.fn().mockResolvedValue({ code: '123456', expiresAt: new Date(Date.now() + 60_000) }) },
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
        user: { findUnique: jest.fn().mockResolvedValue(user) },
    };
    const userRepository = {
        findByEmail: jest.fn().mockResolvedValue(user),
        findById: jest.fn().mockResolvedValue(user),
        findByIdWithRelations: jest.fn().mockResolvedValue(user),
        invalidateCaches: jest.fn().mockResolvedValue(undefined),
    };
    const sessions = {};
    const revoker = {
        revokeBySid: jest.fn().mockResolvedValue([{ id: 'row-1', sessionId: 'sid-1', userId: 'u1' }]),
        revokeAll: jest.fn().mockResolvedValue([]),
    };
    const gateway = {
        revokeSession: jest.fn().mockResolvedValue(undefined),
        invalidateUser: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AuthService(
        prisma as never,
        userRepository as never,
        sessions as never,
        {} as never,
        {} as never,
        { hashPassword: jest.fn().mockResolvedValue('new-hash'), comparePasswords: jest.fn().mockResolvedValue(true) } as never,
        { generateId: jest.fn() } as never,
        {} as never,
        {} as never,
        { publish: jest.fn() } as never,
        gateway as never,
        revoker as never
    );
    return { service, prisma, sessions, gateway, userRepository, revoker };
}

describe('AuthService -> GatewayControl', () => {
    it('logout revokes the session through the revoker (DB + durable event + fast path)', async () => {
        const { service, revoker, gateway } = setup();
        await service.logout('sid-1');
        expect(revoker.revokeBySid).toHaveBeenCalledWith('sid-1');
        expect(gateway.revokeSession).not.toHaveBeenCalled();
    });

    it('logout still hits the gateway fast path when the revoke transaction fails, and never throws', async () => {
        const { service, revoker, gateway } = setup();
        revoker.revokeBySid.mockRejectedValue(new Error('db down'));
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        await expect(service.logout('sid-1')).resolves.toBeUndefined();
        expect(gateway.revokeSession).toHaveBeenCalledWith('sid-1', expect.any(Number));
    });

    it('resetPassword invalidates the user at the gateway with the bumped authzVersion, after commit', async () => {
        const { service, gateway, prisma, revoker } = setup();
        await service.resetPassword('a@b.c', '123456', 'N3w-password!');
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(gateway.invalidateUser).toHaveBeenCalledWith('u1', 5);
        expect(revoker.revokeAll).toHaveBeenCalledWith('u1');
    });

    it('changePassword invalidates the user at the gateway with the bumped authzVersion', async () => {
        const { service, gateway, revoker } = setup();
        await service.changePassword('u1', '123456', 'old', 'N3w-password!');
        expect(gateway.invalidateUser).toHaveBeenCalledWith('u1', 5);
        expect(revoker.revokeAll).toHaveBeenCalledWith('u1');
    });

    it('a rejected reset (wrong code) touches neither the DB write nor the gateway', async () => {
        const { service, gateway, prisma } = setup();
        await expect(service.resetPassword('a@b.c', '000000', 'N3w-password!')).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(gateway.invalidateUser).not.toHaveBeenCalled();
    });
});
