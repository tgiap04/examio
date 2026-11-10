import { AdminBootstrapService } from './admin-bootstrap.service';

function setup(users: Array<{ id: string; email: string; isSystemAdmin: boolean; role?: string }> = []) {
    const prisma = {
        user: {
            findMany: jest.fn(async () => users),
            findUnique: jest.fn(async ({ where }: { where: { email: string } }) =>
                users.find((u) => u.email === where.email) ?? null
            ),
            create: jest.fn(async ({ data }: { data: { id: string; email: string } }) => ({
                id: data.id,
                email: data.email,
            })),
        },
    };
    const roles = {
        change: jest.fn(async () => ({ changed: true, user: {} })),
    };
    const service = new AdminBootstrapService(
        prisma as never,
        roles as never,
        { hashPassword: jest.fn(async () => 'hashed') } as never,
        { generateId: () => 'new-id' } as never
    );
    return { service, prisma, roles };
}

describe('AdminBootstrapService', () => {
    const OLD = { ...process.env };
    afterEach(() => {
        process.env = { ...OLD };
    });

    describe('grant', () => {
        it('grants SYSTEM_ADMIN through RoleChangeService as the cli system actor', async () => {
            const { service, roles } = setup([{ id: 'u1', email: 'a@x.io', isSystemAdmin: false }]);
            const result = await service.grant('A@x.io');
            expect(result).toMatchObject({ email: 'a@x.io' });
            expect(roles.change).toHaveBeenCalledWith({
                actor: { kind: 'system', email: 'cli@system' },
                targetUserId: 'u1',
                isSystemAdmin: true,
                source: 'cli',
            });
        });

        it('--teacher also sets the base role to TEACHER', async () => {
            const { service, roles } = setup([{ id: 'u1', email: 'a@x.io', isSystemAdmin: false }]);
            await service.grant('a@x.io', { teacher: true });
            expect(roles.change).toHaveBeenCalledWith(
                expect.objectContaining({ role: 'TEACHER', isSystemAdmin: true })
            );
        });

        it('re-running grant with the same values still goes through change() (forced re-emit)', async () => {
            const { service, roles } = setup([{ id: 'u1', email: 'a@x.io', isSystemAdmin: true, role: 'TEACHER' }]);
            await service.grant('a@x.io', { teacher: true });
            await service.grant('a@x.io', { teacher: true });
            expect(roles.change).toHaveBeenCalledTimes(2);
        });

        it('returns null for an unknown user and rejects a malformed email', async () => {
            const { service, roles } = setup();
            await expect(service.grant('nobody@x.io')).resolves.toBeNull();
            await expect(service.grant('not-an-email')).rejects.toThrow(/Invalid email/);
            expect(roles.change).not.toHaveBeenCalled();
        });
    });

    describe('revoke', () => {
        it('revokes through RoleChangeService (last-admin guard stays in force)', async () => {
            const { service, roles } = setup([{ id: 'u1', email: 'a@x.io', isSystemAdmin: true }]);
            await service.revoke('a@x.io');
            expect(roles.change).toHaveBeenCalledWith({
                actor: { kind: 'system', email: 'cli@system' },
                targetUserId: 'u1',
                isSystemAdmin: false,
                source: 'cli',
            });
        });

        it('propagates a LAST_SYSTEM_ADMIN refusal', async () => {
            const { service, roles } = setup([{ id: 'u1', email: 'a@x.io', isSystemAdmin: true }]);
            roles.change.mockRejectedValue(new Error('LAST_SYSTEM_ADMIN'));
            await expect(service.revoke('a@x.io')).rejects.toThrow('LAST_SYSTEM_ADMIN');
        });
    });

    describe('syncAdmins (ADMIN_EMAILS)', () => {
        it('skips existing admins, grants non-admins, creates missing users with the bootstrap source', async () => {
            process.env.ADMIN_EMAILS = 'admin@x.io, member@x.io , new@x.io, admin@x.io, bad';
            process.env.ADMIN_DEFAULT_PASSWORD = 'long-enough-secret';
            const { service, prisma, roles } = setup([
                { id: 'a', email: 'admin@x.io', isSystemAdmin: true },
                { id: 'm', email: 'member@x.io', isSystemAdmin: false },
            ]);
            const result = await service.syncAdmins();

            expect(result).toMatchObject({ total: 3, created: 1, granted: 1, skipped: 1, errors: 0 });
            expect(prisma.user.create).toHaveBeenCalledTimes(1);
            const data = prisma.user.create.mock.calls[0][0].data as Record<string, unknown>;
            expect(data).toMatchObject({ email: 'new@x.io', isVerified: true, password: 'hashed' });
            expect(data).not.toHaveProperty('isSystemAdmin');
            expect(roles.change).toHaveBeenCalledTimes(2);
            for (const call of roles.change.mock.calls as unknown as Array<[Record<string, unknown>]>) {
                expect(call[0]).toMatchObject({
                    actor: { kind: 'system', email: 'bootstrap@system' },
                    isSystemAdmin: true,
                    source: 'bootstrap',
                });
            }
        });

        it('is a no-op without ADMIN_EMAILS', async () => {
            delete process.env.ADMIN_EMAILS;
            const { service, prisma, roles } = setup();
            expect(await service.syncAdmins()).toMatchObject({ total: 0 });
            expect(prisma.user.findMany).not.toHaveBeenCalled();
            expect(roles.change).not.toHaveBeenCalled();
        });

        it('reports an error (and does not create) when a new admin has no default password', async () => {
            process.env.ADMIN_EMAILS = 'new@x.io';
            delete process.env.ADMIN_DEFAULT_PASSWORD;
            const { service, prisma } = setup();
            const result = await service.syncAdmins();
            expect(result).toMatchObject({ created: 0, errors: 1 });
            expect(prisma.user.create).not.toHaveBeenCalled();
        });

        it('one failing email does not stop the others', async () => {
            process.env.ADMIN_EMAILS = 'a@x.io,b@x.io';
            const { service, roles } = setup([
                { id: 'a', email: 'a@x.io', isSystemAdmin: false },
                { id: 'b', email: 'b@x.io', isSystemAdmin: false },
            ]);
            roles.change.mockRejectedValueOnce(new Error('boom'));
            const result = await service.syncAdmins();
            expect(result).toMatchObject({ granted: 1, errors: 1 });
        });
    });

    it('listAdmins returns active admins ordered by creation', async () => {
        const { service, prisma } = setup();
        await service.listAdmins();
        expect(prisma.user.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { isSystemAdmin: true }, orderBy: { createdAt: 'asc' } })
        );
    });
});
