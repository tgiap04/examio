import { SessionRevoker } from './session-revoker.service';

const row = (n: number, userId = 'u1') => ({ id: `row-${n}`, sessionId: `sid-${n}`, userId });

function setup(sessions: ReturnType<typeof row>[] = [row(1)]) {
    const order: string[] = [];
    const tx = {
        userSession: {
            findMany: jest.fn(async (_args?: unknown) => (order.push('find'), sessions)),
            updateMany: jest.fn(async (_args?: unknown) => (order.push('deactivate'), { count: sessions.length })),
        },
    };
    const prisma = {
        $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => {
            const result = await fn(tx);
            order.push('commit');
            return result;
        }),
    };
    const publisher = { publish: jest.fn(async (..._args: unknown[]) => void order.push('event')) };
    const gateway = { revokeSession: jest.fn(async (..._args: unknown[]) => void order.push('grpc')) };
    return { order, tx, prisma, publisher, gateway, revoker: new SessionRevoker(prisma as never, publisher as never, gateway as never) };
}

describe('SessionRevoker', () => {
    it('deactivates the session and writes the event in ONE transaction, then fires the gRPC fast path after commit', async () => {
        const { revoker, order, prisma, publisher, gateway, tx } = setup();
        const revoked = await revoker.revokeBySid('sid-1');

        expect(revoked).toHaveLength(1);
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(tx.userSession.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { sessionId: 'sid-1', isActive: true } })
        );
        expect(tx.userSession.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['row-1'] } }, data: { isActive: false } });
        expect(publisher.publish).toHaveBeenCalledWith(tx, { userId: 'u1', sid: 'sid-1', exp: expect.any(Number) }, expect.any(Number));
        expect(gateway.revokeSession).toHaveBeenCalledWith('sid-1', expect.any(Number));
        expect(order).toEqual(['find', 'deactivate', 'event', 'commit', 'grpc']);
    });

    it('event and fast path carry the same exp, covering the longest-lived access token', async () => {
        const { revoker, publisher, gateway } = setup();
        const now = Math.floor(Date.now() / 1000);
        await revoker.revokeBySid('sid-1');
        const exp = (publisher.publish.mock.calls[0] as unknown[])[1] as { exp: number };
        expect(exp.exp).toBeGreaterThanOrEqual(now + 900);
        expect(gateway.revokeSession.mock.calls[0][1]).toBe(exp.exp);
    });

    it('revokes many sessions: one event and one gRPC call per session, all in one transaction', async () => {
        const { revoker, prisma, publisher, gateway } = setup([row(1), row(2), row(3)]);
        const revoked = await revoker.revokeAllOthers('u1', 'sid-current');
        expect(revoked).toHaveLength(3);
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(publisher.publish).toHaveBeenCalledTimes(3);
        expect(gateway.revokeSession.mock.calls.map((c) => c[0]).sort()).toEqual(['sid-1', 'sid-2', 'sid-3']);
    });

    it('revokeAllOthers never targets the current session', async () => {
        const { revoker, tx } = setup([]);
        await revoker.revokeAllOthers('u1', 'sid-current');
        expect(tx.userSession.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { userId: 'u1', sessionId: { not: 'sid-current' }, isActive: true } })
        );
    });

    it('revokeAll and revokeById select by user / row id', async () => {
        const { revoker, tx } = setup([]);
        await revoker.revokeAll('u1');
        await revoker.revokeById('row-9');
        expect(tx.userSession.findMany.mock.calls.map((c) => (c[0] as { where: unknown }).where)).toEqual([
            { userId: 'u1', isActive: true },
            { id: 'row-9', isActive: true },
        ]);
    });

    it('an already-inactive or unknown sid writes no event but still fires the idempotent fast path', async () => {
        const { revoker, publisher, tx, gateway } = setup([]);
        expect(await revoker.revokeBySid('sid-gone')).toEqual([]);
        expect(tx.userSession.updateMany).not.toHaveBeenCalled();
        expect(publisher.publish).not.toHaveBeenCalled();
        expect(gateway.revokeSession).toHaveBeenCalledWith('sid-gone', expect.any(Number));
    });

    it('if the event write fails the transaction fails: no gRPC call, error surfaces', async () => {
        const { revoker, publisher, gateway } = setup();
        publisher.publish.mockRejectedValue(new Error('outbox down'));
        await expect(revoker.revokeBySid('sid-1')).rejects.toThrow('outbox down');
        expect(gateway.revokeSession).not.toHaveBeenCalled();
    });
});
