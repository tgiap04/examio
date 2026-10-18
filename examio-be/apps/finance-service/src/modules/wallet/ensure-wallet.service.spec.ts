import { EnsureWalletService } from './ensure-wallet.service';

function setup(inserted: boolean) {
    const executed: string[] = [];
    const tx = {
        $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
            executed.push(strings.join('?'));
            return inserted ? [{ id: 'w1' }] : [];
        }),
        $executeRaw: jest.fn(async (strings: TemplateStringsArray) => {
            executed.push(strings.join('?'));
            return 1;
        }),
    };
    const prisma = { $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
    let n = 0;
    const service = new EnsureWalletService(prisma as never, { generateId: () => `id-${++n}` } as never);
    return { service, tx, prisma, executed };
}

describe('EnsureWalletService', () => {
    it('inserts wallet ON CONFLICT DO NOTHING, then the welcome tx, then the free subscription', async () => {
        const { service, executed } = setup(true);
        await expect(service.ensure('u1')).resolves.toEqual({ created: true });
        expect(executed).toHaveLength(3);
        expect(executed[0]).toMatch(/INSERT INTO "Wallet"[\s\S]*ON CONFLICT \("userId"\) DO NOTHING[\s\S]*RETURNING id/);
        expect(executed[1]).toMatch(/INSERT INTO "WalletTransaction"/);
        expect(executed[2]).toMatch(/INSERT INTO "UserSubscription"[\s\S]*ON CONFLICT \("userId"\) DO NOTHING/);
    });

    it('writes the welcome transaction ONLY when the wallet row was inserted (once ever)', async () => {
        const { service, executed } = setup(false);
        await expect(service.ensure('u1')).resolves.toEqual({ created: false });
        expect(executed.some((q) => q.includes('"WalletTransaction"'))).toBe(false);
        // The subscription is still ensured (idempotent).
        expect(executed.some((q) => q.includes('"UserSubscription"'))).toBe(true);
    });

    it('runs inside the caller transaction when one is supplied', async () => {
        const { service, prisma, tx } = setup(true);
        await service.ensure('u1', tx as never);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('opens its own transaction otherwise', async () => {
        const { service, prisma } = setup(true);
        await service.ensure('u1');
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('rejects an empty user id', async () => {
        const { service } = setup(true);
        await expect(service.ensure('')).rejects.toThrow(/userId/);
    });
});
