import { DatabaseReadinessCheck } from './readiness.check';
import { PrismaService } from './prisma.service';

describe('DatabaseReadinessCheck', () => {
    it('resolves when SELECT 1 succeeds', async () => {
        const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
        const check = new DatabaseReadinessCheck(prisma as unknown as PrismaService);

        await expect(check.check()).resolves.toBeUndefined();
        expect(check.name).toBe('database');
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('rejects when the database is unreachable', async () => {
        const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('P1001')) };
        const check = new DatabaseReadinessCheck(prisma as unknown as PrismaService);

        await expect(check.check()).rejects.toThrow('P1001');
    });
});
