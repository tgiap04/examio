import { AccessTokenService, AccountDisabledException } from './access-token.service';

function setup(user: Record<string, unknown> | null, lockRows = [{ id: 'u1' }]) {
    const tx = {
        $queryRaw: jest.fn(async () => lockRows),
        user: { findUnique: jest.fn(async () => user) },
    };
    const prisma = { $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
    const tokens = {
        signUserToken: jest.fn(async () => ({ token: 'signed', expiresInSeconds: 900 })),
    };
    return { service: new AccessTokenService(prisma as never, tokens as never), tx, tokens, prisma };
}

const row = (over: Record<string, unknown> = {}) => ({
    id: 'u1', role: 'TEACHER', isSystemAdmin: true, authzVersion: 6,
    isBanned: false, deletedAt: null, isVerified: true, password: 'hash', ...over,
});

describe('AccessTokenService.issue', () => {
    it('reads the account under FOR SHARE and signs roles + av from that same read', async () => {
        const { service, tx, tokens } = setup(row());
        const issued = await service.issue('u1', 'sid-1');
        const sql = (tx.$queryRaw.mock.calls[0] as unknown[])[0] as string[];
        expect(sql.join('?')).toMatch(/FROM "User" WHERE id = \?\s+FOR SHARE/);
        expect(tokens.signUserToken).toHaveBeenCalledWith({
            userId: 'u1', sessionId: 'sid-1', roles: ['TEACHER', 'SYSTEM_ADMIN'],
            emailVerified: true, authzVersion: 6,
        });
        expect(issued).toMatchObject({
            token: 'signed',
            roles: ['TEACHER', 'SYSTEM_ADMIN'],
        });
        expect(issued.permissions).toContain('word_family:save');
        expect(issued.permissions).toContain('role:assign');
    });

    it('signs email_verified=false for an unverified user', async () => {
        const { service, tokens } = setup(row({ isVerified: false, role: 'STUDENT', isSystemAdmin: false }));
        await service.issue('u1', 's');
        expect(tokens.signUserToken).toHaveBeenCalledWith(
            expect.objectContaining({ roles: ['STUDENT'], emailVerified: false })
        );
    });

    it('rejects banned and deleted users with 401 ACCOUNT_DISABLED and signs nothing', async () => {
        for (const over of [{ isBanned: true }, { deletedAt: new Date() }]) {
            const { service, tokens } = setup(row(over));
            const err = await service.issue('u1', 's').catch((e) => e);
            expect(err).toBeInstanceOf(AccountDisabledException);
            expect(err.getStatus()).toBe(401);
            expect(err.getResponse()).toMatchObject({ code: 'ACCOUNT_DISABLED' });
            expect(tokens.signUserToken).not.toHaveBeenCalled();
        }
    });

    it('404 when the user is gone', async () => {
        const { service } = setup(null, []);
        await expect(service.issue('u1', 's')).rejects.toMatchObject({ status: 404 });
    });
});
