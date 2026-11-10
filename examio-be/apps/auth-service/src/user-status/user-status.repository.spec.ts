import { UserStatusRepository } from './user-status.repository';

function setup() {
    const tx = {
        user: { update: jest.fn(async () => ({ id: 'u1', isBanned: true, authzVersion: 3 })) },
        userSession: {
            findMany: jest.fn(),
            updateMany: jest.fn(async () => ({ count: 0 })),
        },
    };
    return { tx, repo: new UserStatusRepository() };
}

describe('UserStatusRepository', () => {
    it('ban: sets isBanned, bumps authzVersion by one and never touches deletedAt', async () => {
        const { repo, tx } = setup();
        await repo.setBanned(tx as never, 'u1', true);
        const arg = (tx.user.update.mock.calls[0] as unknown[])[0] as { where: unknown; data: Record<string, unknown> };
        expect(arg.where).toEqual({ id: 'u1' });
        expect(arg.data).toEqual({ isBanned: true, authzVersion: { increment: 1 } });
        expect(arg.data).not.toHaveProperty('deletedAt');
    });

    it('unban: also clears deletedAt left by the pre-RBAC ban', async () => {
        const { repo, tx } = setup();
        await repo.setBanned(tx as never, 'u1', false);
        const arg = (tx.user.update.mock.calls[0] as unknown[])[0] as { data: Record<string, unknown> };
        expect(arg.data).toEqual({ isBanned: false, authzVersion: { increment: 1 }, deletedAt: null });
    });

    it('deactivateSessions: deactivates exactly the active sessions it found and returns their sids', async () => {
        const { repo, tx } = setup();
        tx.userSession.findMany.mockResolvedValue([{ id: 'a', sessionId: 'sid-a' }, { id: 'b', sessionId: 'sid-b' }]);
        const res = await repo.deactivateSessions(tx as never, 'u1');
        expect(tx.userSession.findMany).toHaveBeenCalledWith({ where: { userId: 'u1', isActive: true }, select: { id: true, sessionId: true } });
        expect(tx.userSession.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b'] } }, data: { isActive: false } });
        expect(res).toEqual([{ sessionId: 'sid-a' }, { sessionId: 'sid-b' }]);
    });

    it('deactivateSessions: no active session -> no update', async () => {
        const { repo, tx } = setup();
        tx.userSession.findMany.mockResolvedValue([]);
        expect(await repo.deactivateSessions(tx as never, 'u1')).toEqual([]);
        expect(tx.userSession.updateMany).not.toHaveBeenCalled();
    });
});
