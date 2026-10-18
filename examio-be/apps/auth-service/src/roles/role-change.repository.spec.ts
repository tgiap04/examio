import { HttpException } from '@nestjs/common';
import { RoleChangeRepository } from './role-change.repository';
import { RoleChangeService } from './role-change.service';

const sqlOf = (call: unknown[]): string => (call[0] as string[]).join('?').replace(/\s+/g, ' ');

function tx() {
    return {
        $executeRaw: jest.fn(async (..._a: unknown[]): Promise<number> => 1),
        $queryRaw: jest.fn(async (..._a: unknown[]): Promise<unknown[]> => [{ n: 3, id: 'x' }]),
        user: { update: jest.fn(async (..._a: unknown[]): Promise<unknown> => ({ id: 'u', authzVersion: 2 })) },
        roleChangeLog: { create: jest.fn(async () => ({})) },
    };
}

describe('RoleChangeRepository SQL', () => {
    it('lock = tx-scoped advisory lock on the fixed role-change key (void result via $executeRaw)', async () => {
        const t = tx();
        await new RoleChangeRepository({} as never).lock(t as never);
        expect(t.$executeRaw).toHaveBeenCalledTimes(1);
        expect(sqlOf(t.$executeRaw.mock.calls[0] as unknown[])).toBe("SELECT pg_advisory_xact_lock(hashtext('role-change'))");
        expect(t.$queryRaw).not.toHaveBeenCalled();
    });

    it('the target is read FOR UPDATE, the actor is a plain read', async () => {
        const t = tx();
        const repo = new RoleChangeRepository({} as never);
        await repo.findTargetForUpdate(t as never, 'u1');
        await repo.findActor(t as never, 'a1');
        expect(sqlOf(t.$queryRaw.mock.calls[0])).toMatch(/FROM "User" WHERE id = \? FOR UPDATE$/);
        expect(sqlOf(t.$queryRaw.mock.calls[1])).not.toMatch(/FOR UPDATE/);
    });

    it('counts only ACTIVE admins (not banned, not deleted)', async () => {
        const t = tx();
        await expect(new RoleChangeRepository({} as never).countActiveAdmins(t as never)).resolves.toBe(3);
        expect(sqlOf(t.$queryRaw.mock.calls[0])).toContain('"isSystemAdmin" AND NOT "isBanned" AND "deletedAt" IS NULL');
    });

    it('updateAccount bumps authzVersion by exactly one with the role/admin patch', async () => {
        const t = tx();
        await new RoleChangeRepository({} as never).updateAccount(t as never, 'u1', { role: 'TEACHER', isSystemAdmin: false });
        expect(t.user.update.mock.calls[0][0]).toMatchObject({
            where: { id: 'u1' },
            data: { role: 'TEACHER', isSystemAdmin: false, authzVersion: { increment: 1 } },
        });
    });

    it('transaction() runs with bounded wait/timeout', async () => {
        const prisma = { $transaction: jest.fn(async (fn: (t: unknown) => unknown, _opts?: unknown) => fn('tx')) };
        await expect(new RoleChangeRepository(prisma as never).transaction(async (t) => t)).resolves.toBe('tx');
        expect(prisma.$transaction.mock.calls[0][1]).toEqual({ maxWait: 5000, timeout: 10000 });
    });
});

describe('serialization failures through the real repository + service', () => {
    const conflict = (code: string) => Object.assign(new Error('boom'), { meta: { code } });
    const input = { actor: { kind: 'system', email: 's@system' }, targetUserId: 't', role: 'TEACHER', source: 'cli' } as const;

    function build(failures: unknown[]) {
        const t = tx();
        t.$queryRaw.mockImplementation(async (strings: unknown) => {
            const sql = (strings as TemplateStringsArray).join('?');
            if (sql.includes('FOR UPDATE')) {
                return [{ id: 't', email: 't@x', role: 'STUDENT', isSystemAdmin: false, isBanned: false, deletedAt: null, authzVersion: 1 }];
            }
            return [{ n: 2 }];
        });
        t.user.update.mockResolvedValue({ id: 't', email: 't@x', role: 'TEACHER', isSystemAdmin: false, isBanned: false, deletedAt: null, authzVersion: 2 } as never);
        let n = 0;
        const prisma = {
            $transaction: jest.fn(async (fn: (x: unknown) => unknown) => {
                if (n < failures.length) throw failures[n++];
                return fn(t);
            }),
        };
        const publisher = { publish: jest.fn() };
        const service = new RoleChangeService(
            new RoleChangeRepository(prisma as never),
            publisher as never,
            { invalidateUser: jest.fn(async () => undefined) } as never,
            { generateId: () => 'log' } as never
        );
        return { service, prisma, publisher };
    }

    it.each(['40P01', '40001'])('%s on the first attempt is retried once and then succeeds', async (code) => {
        const { service, prisma, publisher } = build([conflict(code)]);
        await expect(service.change(input)).resolves.toMatchObject({ changed: true });
        expect(prisma.$transaction).toHaveBeenCalledTimes(2);
        expect(publisher.publish).toHaveBeenCalledTimes(1);
    });

    it.each(['40P01', '40001'])('%s twice -> 409 ROLE_CHANGE_CONFLICT, nothing published', async (code) => {
        const { service, prisma, publisher } = build([conflict(code), conflict(code)]);
        const err = await service.change(input).catch((e) => e);
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(409);
        expect(err.getResponse()).toMatchObject({ code: 'ROLE_CHANGE_CONFLICT' });
        expect(prisma.$transaction).toHaveBeenCalledTimes(2);
        expect(publisher.publish).not.toHaveBeenCalled();
    });

    it('Prisma P2034 (write conflict / deadlock) is treated the same', async () => {
        const { service, prisma } = build([Object.assign(new Error('x'), { code: 'P2034' })]);
        await expect(service.change(input)).resolves.toBeDefined();
        expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });
});
