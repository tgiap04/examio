import { HttpException } from '@nestjs/common';
import { RoleChangeService } from './role-change.service';
import type { AccountRow, RoleChangeRepository } from './role-change.repository';
import type { AuthzChangedPublisher } from './authz-changed.publisher';
import type { GatewayControlClient } from '../clients/gateway-control.client';

const TX = { __tx: true } as never;

const account = (over: Partial<AccountRow> = {}): AccountRow => ({
    id: 'target',
    email: 'target@x.io',
    role: 'STUDENT',
    isSystemAdmin: false,
    isBanned: false,
    deletedAt: null,
    authzVersion: 4,
    ...over,
});

function setup(opts: { actor?: AccountRow | null; target?: AccountRow | null; admins?: number } = {}) {
    const calls: string[] = [];
    const repo = {
        transaction: jest.fn(async (fn: (tx: never) => Promise<unknown>) => fn(TX)),
        lock: jest.fn(async () => void calls.push('lock')),
        findActor: jest.fn(async () => {
            calls.push('findActor');
            return opts.actor === undefined
                ? account({ id: 'admin', email: 'admin@x.io', isSystemAdmin: true })
                : opts.actor;
        }),
        findTargetForUpdate: jest.fn(async () => {
            calls.push('findTarget');
            return opts.target === undefined ? account() : opts.target;
        }),
        countActiveAdmins: jest.fn(async () => opts.admins ?? 2),
        updateAccount: jest.fn(async (_tx: never, _id: string, patch: { role: string; isSystemAdmin: boolean }) => {
            calls.push('update');
            return account({ ...patch, authzVersion: 5 } as Partial<AccountRow>);
        }),
        insertLog: jest.fn(async () => void calls.push('log')),
    };
    const publisher = { publish: jest.fn(async () => void calls.push('event')) };
    const gateway = { invalidateUser: jest.fn(async () => void calls.push('invalidate')) };
    const service = new RoleChangeService(
        repo as unknown as RoleChangeRepository,
        publisher as unknown as AuthzChangedPublisher,
        gateway as unknown as GatewayControlClient,
        { generateId: () => 'log-1' } as never
    );
    return { service, repo, publisher, gateway, calls };
}

const adminActor = { kind: 'user', userId: 'admin' } as const;
const cliActor = { kind: 'system', email: 'cli@system' } as const;

async function statusOf(p: Promise<unknown>) {
    try {
        await p;
    } catch (e) {
        if (e instanceof HttpException) {
            return [e.getStatus(), (e.getResponse() as { code: string }).code];
        }
        throw e;
    }
    return ['ok'];
}

describe('RoleChangeService.change', () => {
    it('refuses a self-change with 403 CANNOT_CHANGE_OWN_ROLE before touching the DB', async () => {
        const { service, repo } = setup();
        expect(
            await statusOf(
                service.change({ actor: { kind: 'user', userId: 'target' }, targetUserId: 'target', role: 'TEACHER', source: 'admin-ui' })
            )
        ).toEqual([403, 'CANNOT_CHANGE_OWN_ROLE']);
        expect(repo.transaction).not.toHaveBeenCalled();
    });

    it('re-checks the actor in the DB: a demoted / banned / deleted / missing actor gets 403', async () => {
        for (const actor of [
            account({ id: 'admin', isSystemAdmin: false }),
            account({ id: 'admin', isSystemAdmin: true, isBanned: true }),
            account({ id: 'admin', isSystemAdmin: true, deletedAt: new Date() }),
            null,
        ]) {
            const { service, repo } = setup({ actor });
            expect(
                await statusOf(service.change({ actor: adminActor, targetUserId: 'target', role: 'TEACHER', source: 'admin-ui' }))
            ).toEqual([403, 'PERMISSION_DENIED']);
            expect(repo.updateAccount).not.toHaveBeenCalled();
        }
    });

    it('skips the actor check for the CLI system actor but keeps the lock', async () => {
        const { service, repo, calls } = setup({ actor: null });
        await service.change({ actor: cliActor, targetUserId: 'target', role: 'TEACHER', source: 'cli' });
        expect(repo.findActor).not.toHaveBeenCalled();
        expect(calls[0]).toBe('lock');
    });

    it('takes the advisory lock first, then re-reads actor, then locks the target row', async () => {
        const { service, calls } = setup();
        await service.change({ actor: adminActor, targetUserId: 'target', role: 'TEACHER', source: 'admin-ui' });
        expect(calls.slice(0, 3)).toEqual(['lock', 'findActor', 'findTarget']);
    });

    it('404 when the target does not exist or is deleted', async () => {
        for (const target of [null, account({ deletedAt: new Date() })]) {
            const { service } = setup({ target });
            expect(
                await statusOf(service.change({ actor: adminActor, targetUserId: 'target', role: 'TEACHER', source: 'admin-ui' }))
            ).toEqual([404, 'USER_NOT_FOUND']);
        }
    });

    it('blocks demoting the last active SYSTEM_ADMIN with 409 LAST_SYSTEM_ADMIN', async () => {
        const { service, repo } = setup({
            target: account({ id: 'other-admin', isSystemAdmin: true }),
            admins: 1,
        });
        expect(
            await statusOf(service.change({ actor: adminActor, targetUserId: 'other-admin', isSystemAdmin: false, source: 'admin-ui' }))
        ).toEqual([409, 'LAST_SYSTEM_ADMIN']);
        expect(repo.updateAccount).not.toHaveBeenCalled();
    });

    it('allows demoting an admin when another active admin remains', async () => {
        const { service } = setup({ target: account({ isSystemAdmin: true }), admins: 2 });
        const result = await service.change({ actor: adminActor, targetUserId: 'target', isSystemAdmin: false, source: 'admin-ui' });
        expect(result.changed).toBe(true);
    });

    it('does not count a banned admin as a blocker for demoting them', async () => {
        const { service } = setup({ target: account({ isSystemAdmin: true, isBanned: true }), admins: 1 });
        const result = await service.change({ actor: adminActor, targetUserId: 'target', isSystemAdmin: false, source: 'admin-ui' });
        expect(result.changed).toBe(true);
    });

    it('success: updates (av+1), writes the log, emits ONE authz_changed, then invalidates the gateway after commit', async () => {
        const { service, repo, publisher, gateway, calls } = setup();
        const result = await service.change({
            actor: adminActor, targetUserId: 'target', role: 'TEACHER', reason: 'promote', source: 'admin-ui',
        });
        expect(result).toMatchObject({ changed: true, user: { role: 'TEACHER', authzVersion: 5 } });
        expect(repo.insertLog).toHaveBeenCalledWith(
            TX,
            expect.objectContaining({
                id: 'log-1', targetUserId: 'target', targetEmail: 'target@x.io',
                actorUserId: 'admin', actorEmail: 'admin@x.io',
                fromRole: 'STUDENT', toRole: 'TEACHER', fromAdmin: false, toAdmin: false,
                reason: 'promote', source: 'admin-ui',
            })
        );
        expect(publisher.publish).toHaveBeenCalledTimes(1);
        expect(publisher.publish).toHaveBeenCalledWith(
            TX,
            expect.objectContaining({ id: 'target', role: 'TEACHER', authzVersion: 5, isSystemAdmin: false, isBanned: false }),
            'role'
        );
        expect(gateway.invalidateUser).toHaveBeenCalledWith('target', 5);
        expect(calls.indexOf('invalidate')).toBeGreaterThan(calls.indexOf('event'));
        expect(calls.indexOf('event')).toBeGreaterThan(calls.indexOf('update'));
    });

    it('uses reason "admin" when only the admin flag changes', async () => {
        const { service, publisher } = setup();
        await service.change({ actor: adminActor, targetUserId: 'target', isSystemAdmin: true, source: 'admin-ui' });
        expect(publisher.publish).toHaveBeenCalledWith(TX, expect.anything(), 'admin');
    });

    it('re-apply: writes a log + authz_changed(reapply), no user update, no gateway call', async () => {
        const { service, repo, publisher, gateway } = setup({ target: account({ role: 'TEACHER' }) });
        const result = await service.change({ actor: cliActor, targetUserId: 'target', role: 'TEACHER', source: 'cli' });
        expect(result.changed).toBe(false);
        expect(repo.updateAccount).not.toHaveBeenCalled();
        expect(repo.insertLog).toHaveBeenCalledWith(TX, expect.objectContaining({ reason: 'reapply', fromRole: 'TEACHER', toRole: 'TEACHER' }));
        expect(publisher.publish).toHaveBeenCalledWith(TX, expect.objectContaining({ authzVersion: 4 }), 'reapply');
        expect(gateway.invalidateUser).not.toHaveBeenCalled();
    });

    it('a gateway failure never fails a committed change', async () => {
        const { service, gateway } = setup();
        gateway.invalidateUser.mockRejectedValue(new Error('gateway down'));
        await expect(
            service.change({ actor: adminActor, targetUserId: 'target', role: 'TEACHER', source: 'admin-ui' })
        ).resolves.toMatchObject({ changed: true });
    });

    describe('conflict retry', () => {
        const deadlock = Object.assign(new Error('deadlock detected'), { meta: { code: '40P01' } });

        it('retries the transaction once on 40P01 and then succeeds', async () => {
            const { service, repo } = setup();
            let n = 0;
            repo.transaction.mockImplementation(async (fn: (tx: never) => Promise<unknown>) => {
                if (++n === 1) throw deadlock;
                return fn(TX);
            });
            await expect(
                service.change({ actor: adminActor, targetUserId: 'target', role: 'TEACHER', source: 'admin-ui' })
            ).resolves.toMatchObject({ changed: true });
            expect(repo.transaction).toHaveBeenCalledTimes(2);
        });

        it('a second 40P01/40001 becomes 409 ROLE_CHANGE_CONFLICT', async () => {
            const { service, repo } = setup();
            repo.transaction.mockRejectedValue(
                Object.assign(new Error('could not serialize'), { meta: { code: '40001' } })
            );
            expect(
                await statusOf(service.change({ actor: adminActor, targetUserId: 'target', role: 'TEACHER', source: 'admin-ui' }))
            ).toEqual([409, 'ROLE_CHANGE_CONFLICT']);
            expect(repo.transaction).toHaveBeenCalledTimes(2);
        });

        it('does not retry unrelated errors', async () => {
            const { service, repo } = setup();
            repo.transaction.mockRejectedValue(new Error('boom'));
            await expect(
                service.change({ actor: adminActor, targetUserId: 'target', role: 'TEACHER', source: 'admin-ui' })
            ).rejects.toThrow('boom');
            expect(repo.transaction).toHaveBeenCalledTimes(1);
        });
    });
});
