import { NotFoundException } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { userSelectSafe } from './user-select.safe';

const user = (over: Record<string, unknown> = {}) => ({
    id: 'u1', email: 'u1@x.io', username: 'u1', name: 'U', bio: 'b', isVerified: false, isBanned: false, isSystemAdmin: false, role: 'STUDENT', ...over,
});

function setup() {
    const tx = {
        user: { findUnique: jest.fn(), update: jest.fn() },
        adminAudit: { createMany: jest.fn(async () => ({ count: 0 })) },
    };
    const prisma = {
        user: { findUnique: jest.fn(), findMany: jest.fn(async () => [user()]), count: jest.fn(async () => 1) },
        $transaction: jest.fn(async (arg: unknown) =>
            typeof arg === 'function' ? (arg as (t: unknown) => unknown)(tx) : Promise.all(arg as unknown[])
        ),
    };
    const service = new AdminUsersService(prisma as never, { write: jest.fn() } as never, {} as never);
    return { service, prisma, tx };
}
const ctx = { adminId: 'admin1', ipAddress: '9.9.9.9', userAgent: 'jest' };
const q = (over: Record<string, unknown> = {}) => ({ page: 1, pageSize: 20, ...over });

describe('AdminUsersService.listUsers', () => {
    it('pages with skip/take, newest first, safe select only', async () => {
        const { service, prisma } = setup();
        const res = await service.listUsers(q({ page: 3, pageSize: 10 }) as never);
        expect(prisma.user.findMany).toHaveBeenCalledWith({
            where: {}, select: userSelectSafe, orderBy: { createdAt: 'desc' }, skip: 20, take: 10,
        });
        expect(res).toMatchObject({ total: 1, page: 3, pageSize: 10 });
        expect(userSelectSafe).not.toHaveProperty('password');
    });

    it('maps every filter into the where clause', async () => {
        const { service, prisma } = setup();
        await service.listUsers(
            q({ search: 'ab', isSystemAdmin: true, isVerified: false, isBanned: true, createdFrom: '2026-01-01T00:00:00.000Z', createdTo: '2026-02-01T00:00:00.000Z' }) as never
        );
        const where = (prisma.user.findMany.mock.calls[0] as unknown[])[0] as { where: Record<string, unknown> };
        expect(where.where).toMatchObject({
            OR: [{ email: { contains: 'ab', mode: 'insensitive' } }, { username: { contains: 'ab', mode: 'insensitive' } }],
            isSystemAdmin: true, isVerified: false, isBanned: true,
            createdAt: { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-02-01T00:00:00.000Z') },
        });
        expect(prisma.user.count).toHaveBeenCalledWith({ where: where.where });
    });
});

describe('AdminUsersService.getUserDetail', () => {
    it('flattens wallet, subscription and the last session', async () => {
        const { service, prisma } = setup();
        prisma.user.findUnique.mockResolvedValue({
            ...user(), wallet: { id: 'w', balance: 5 }, subscription: { id: 's', tier: 1, billingCycle: 'monthly', isActive: true },
            sessions: [{ id: 'ses', deviceName: 'd', browser: 'b', os: 'o', ipAddress: '1.1.1.1', country: null, city: null, lastActivity: new Date(0), isActive: true }],
        });
        const res = await service.getUserDetail('u1');
        expect(res.user).toEqual(user());
        expect(res.wallet).toEqual({ id: 'w', balance: 5 });
        expect(res.subscription).toMatchObject({ tier: 1, isActive: true });
        expect(res.lastSession).toMatchObject({ id: 'ses', ipAddress: '1.1.1.1' });
    });

    it('nulls for a user without wallet/subscription/session; 404 for an unknown id', async () => {
        const { service, prisma } = setup();
        prisma.user.findUnique.mockResolvedValueOnce({ ...user(), wallet: null, subscription: null, sessions: [] });
        expect(await service.getUserDetail('u1')).toMatchObject({ wallet: null, subscription: null, lastSession: null });
        prisma.user.findUnique.mockResolvedValueOnce(null);
        await expect(service.getUserDetail('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe('AdminUsersService.updateUser', () => {
    it('writes only changed fields, stamps updatedBy and one audit row per field', async () => {
        const { service, tx } = setup();
        tx.user.findUnique.mockResolvedValue(user());
        tx.user.update.mockResolvedValue(user({ name: 'New', bio: 'b', isVerified: true }));
        const res = await service.updateUser('u1', { name: 'New', bio: 'b', isVerified: true }, ctx);
        expect(res.changedFields).toEqual(['isVerified', 'name']);
        expect(tx.user.update.mock.calls[0][0].data).toEqual({ updatedBy: 'admin1', isVerified: true, name: 'New' });
        expect(tx.adminAudit.createMany).toHaveBeenCalledWith({
            data: [
                { adminId: 'admin1', action: 'admin.user.update', targetId: 'u1', payload: { field: 'isVerified', from: false, to: true }, ipAddress: '9.9.9.9', userAgent: 'jest' },
                { adminId: 'admin1', action: 'admin.user.update', targetId: 'u1', payload: { field: 'name', from: 'U', to: 'New' }, ipAddress: '9.9.9.9', userAgent: 'jest' },
            ],
        });
    });

    it('a no-op body changes nothing and writes no audit', async () => {
        const { service, tx } = setup();
        tx.user.findUnique.mockResolvedValue(user());
        const res = await service.updateUser('u1', { name: 'U' }, ctx);
        expect(res.changedFields).toEqual([]);
        expect(tx.user.update).not.toHaveBeenCalled();
        expect(tx.adminAudit.createMany).not.toHaveBeenCalled();
    });

    it('404 for an unknown user', async () => {
        const { service, tx } = setup();
        tx.user.findUnique.mockResolvedValue(null);
        await expect(service.updateUser('nope', { name: 'x' }, ctx)).rejects.toBeInstanceOf(NotFoundException);
    });
});
