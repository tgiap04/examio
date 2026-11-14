import { HttpException } from '@nestjs/common';
import type { AccountRow, RoleChangeRepository } from '../roles/role-change.repository';
import type { AuthzChangedPublisher } from '../roles/authz-changed.publisher';
import type { SessionRevokedPublisher } from '../devices/session-revoked.publisher';
import type { GatewayControlClient } from '../clients/gateway-control.client';
import { UserStatusService } from './user-status.service';
import type { UserStatusRepository } from './user-status.repository';

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

function setup(opts: { actor?: AccountRow | null; target?: AccountRow | null; admins?: number; sessions?: string[] } = {}) {
    const calls: string[] = [];
    const roleRepo = {
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
        countActiveAdmins: jest.fn(async () => {
            calls.push('count');
            return opts.admins ?? 2;
        }),
        insertLog: jest.fn(async () => void calls.push('log')),
    };
    const statusRepo = {
        setBanned: jest.fn(async (_tx: never, _id: string, isBanned: boolean) => {
            calls.push('update');
            return account({ isBanned, authzVersion: 5 });
        }),
        deactivateSessions: jest.fn(async () => {
            calls.push('sessions');
            return (opts.sessions ?? ['s1', 's2']).map((sessionId) => ({ sessionId }));
        }),
    };
    const authz = { publish: jest.fn(async () => void calls.push('event')) };
    const sessionEvents = { publish: jest.fn(async () => void calls.push('session-event')) };
    const gateway = {
        invalidateUser: jest.fn(async () => void calls.push('invalidate')),
        revokeSession: jest.fn(async () => void calls.push('revoke')),
    };
    const service = new UserStatusService(
        roleRepo as unknown as RoleChangeRepository,
        statusRepo as unknown as UserStatusRepository,
        authz as unknown as AuthzChangedPublisher,
        sessionEvents as unknown as SessionRevokedPublisher,
        gateway as unknown as GatewayControlClient,
        { generateId: () => 'log-1' } as never
    );
    return { service, roleRepo, statusRepo, authz, sessionEvents, gateway, calls };
}

const input = (over: Record<string, unknown> = {}) => ({
    actorUserId: 'admin',
    targetUserId: 'target',
    isBanned: true,
    ...over,
});

async function statusOf(p: Promise<unknown>) {
    try {
        await p;
    } catch (e) {
        if (e instanceof HttpException) return [e.getStatus(), (e.getResponse() as { code: string }).code];
        throw e;
    }
    return ['ok'];
}

describe('UserStatusService.setStatus', () => {
    it('refuses a self-change with 403 CANNOT_CHANGE_OWN_STATUS before touching the DB', async () => {
        const { service, roleRepo } = setup();
        expect(await statusOf(service.setStatus(input({ targetUserId: 'admin' })))).toEqual([403, 'CANNOT_CHANGE_OWN_STATUS']);
        expect(roleRepo.transaction).not.toHaveBeenCalled();
    });

    it('re-checks the actor in the DB: demoted / banned / deleted / missing actor gets 403', async () => {
        for (const actor of [
            account({ id: 'admin', isSystemAdmin: false }),
            account({ id: 'admin', isSystemAdmin: true, isBanned: true }),
            account({ id: 'admin', isSystemAdmin: true, deletedAt: new Date() }),
            null,
        ]) {
            const { service, statusRepo } = setup({ actor });
            expect(await statusOf(service.setStatus(input()))).toEqual([403, 'PERMISSION_DENIED']);
            expect(statusRepo.setBanned).not.toHaveBeenCalled();
        }
    });

    it('takes the advisory lock first, then the actor, then locks the target row', async () => {
        const { service, calls } = setup();
        await service.setStatus(input());
        expect(calls.slice(0, 3)).toEqual(['lock', 'findActor', 'findTarget']);
    });

    it('404 when the target is missing or a really deleted (not banned) account', async () => {
        for (const target of [null, account({ deletedAt: new Date() })]) {
            const { service } = setup({ target });
            expect(await statusOf(service.setStatus(input()))).toEqual([404, 'USER_NOT_FOUND']);
        }
    });

    it('banning the last active SYSTEM_ADMIN is 409 LAST_SYSTEM_ADMIN and writes nothing', async () => {
        const { service, statusRepo, authz } = setup({ target: account({ isSystemAdmin: true }), admins: 1 });
        expect(await statusOf(service.setStatus(input()))).toEqual([409, 'LAST_SYSTEM_ADMIN']);
        expect(statusRepo.setBanned).not.toHaveBeenCalled();
        expect(authz.publish).not.toHaveBeenCalled();
    });

    it('LAST_SYSTEM_ADMIN is decided by the count taken AFTER the lock, the actor check and the target row lock; actor and target differ and nothing is written', async () => {
        const { service, statusRepo, roleRepo, authz, sessionEvents, gateway, calls } = setup({
            actor: account({ id: 'admin', email: 'admin@x.io', isSystemAdmin: true }),
            target: account({ id: 'sole', isSystemAdmin: true }),
            admins: 1,
        });
        expect(await statusOf(service.setStatus(input({ targetUserId: 'sole' })))).toEqual([409, 'LAST_SYSTEM_ADMIN']);
        expect(calls).toEqual(['lock', 'findActor', 'findTarget', 'count']);
        for (const w of [statusRepo.setBanned, statusRepo.deactivateSessions, roleRepo.insertLog, authz.publish, sessionEvents.publish, gateway.invalidateUser, gateway.revokeSession]) {
            expect(w).not.toHaveBeenCalled();
        }
    });

    it('banning an admin is allowed while another active admin remains', async () => {
        const { service } = setup({ target: account({ isSystemAdmin: true }), admins: 2 });
        await expect(service.setStatus(input())).resolves.toMatchObject({ changed: true });
    });

    it('unbanning is never blocked by the admin count', async () => {
        const { service } = setup({ target: account({ isSystemAdmin: true, isBanned: true }), admins: 0 });
        await expect(service.setStatus(input({ isBanned: false }))).resolves.toMatchObject({ changed: true });
    });

    it('no-op (already in the requested state): no update, no log, no event, no gateway call', async () => {
        for (const [target, isBanned] of [[account(), false], [account({ isBanned: true }), true]] as const) {
            const { service, statusRepo, roleRepo, authz, gateway } = setup({ target });
            await expect(service.setStatus(input({ isBanned }))).resolves.toMatchObject({ changed: false });
            expect(statusRepo.setBanned).not.toHaveBeenCalled();
            expect(roleRepo.insertLog).not.toHaveBeenCalled();
            expect(authz.publish).not.toHaveBeenCalled();
            expect(gateway.invalidateUser).not.toHaveBeenCalled();
        }
    });

    it('ban: av+1, sessions inactive, log, authz_changed(ban) in the SAME tx, invalidate after commit', async () => {
        const { service, statusRepo, roleRepo, authz, sessionEvents, gateway, calls } = setup();
        const result = await service.setStatus(input({ reason: 'spam' }));
        expect(result).toMatchObject({ changed: true, user: { isBanned: true, authzVersion: 5 } });
        expect(statusRepo.setBanned).toHaveBeenCalledWith(TX, 'target', true);
        expect(statusRepo.deactivateSessions).toHaveBeenCalledWith(TX, 'target');
        expect(sessionEvents.publish).toHaveBeenCalledTimes(2);
        expect(roleRepo.insertLog).toHaveBeenCalledWith(
            TX,
            expect.objectContaining({
                id: 'log-1', targetUserId: 'target', actorUserId: 'admin', actorEmail: 'admin@x.io',
                fromRole: 'STUDENT', toRole: 'STUDENT', fromAdmin: false, toAdmin: false,
                reason: 'ban: spam', source: 'admin-ui',
            })
        );
        expect(authz.publish).toHaveBeenCalledTimes(1);
        expect(authz.publish).toHaveBeenCalledWith(TX, expect.objectContaining({ id: 'target', isBanned: true, authzVersion: 5 }), 'ban');
        expect(gateway.invalidateUser).toHaveBeenCalledWith('target', 5);
        expect(gateway.revokeSession).toHaveBeenCalledTimes(2);
        expect(calls.indexOf('invalidate')).toBeGreaterThan(calls.indexOf('event'));
        expect(calls.indexOf('event')).toBeGreaterThan(calls.indexOf('update'));
    });

    it('unban: av+1, no session work, authz_changed(unban), log reason "unban"', async () => {
        const { service, statusRepo, roleRepo, authz, sessionEvents } = setup({ target: account({ isBanned: true }) });
        await service.setStatus(input({ isBanned: false }));
        expect(statusRepo.setBanned).toHaveBeenCalledWith(TX, 'target', false);
        expect(statusRepo.deactivateSessions).not.toHaveBeenCalled();
        expect(sessionEvents.publish).not.toHaveBeenCalled();
        expect(roleRepo.insertLog).toHaveBeenCalledWith(TX, expect.objectContaining({ reason: 'unban' }));
        expect(authz.publish).toHaveBeenCalledWith(TX, expect.anything(), 'unban');
    });

    it('unbanning a legacy ban (isBanned + deletedAt) is allowed', async () => {
        const { service } = setup({ target: account({ isBanned: true, deletedAt: new Date() }) });
        await expect(service.setStatus(input({ isBanned: false }))).resolves.toMatchObject({ changed: true });
    });

    it('a gateway failure never fails a committed ban', async () => {
        const { service, gateway } = setup();
        gateway.invalidateUser.mockRejectedValue(new Error('down'));
        gateway.revokeSession.mockRejectedValue(new Error('down'));
        await expect(service.setStatus(input())).resolves.toMatchObject({ changed: true });
    });

    describe('conflict retry', () => {
        const deadlock = Object.assign(new Error('deadlock detected'), { meta: { code: '40P01' } });

        it('retries once on 40P01 then succeeds', async () => {
            const { service, roleRepo } = setup();
            let n = 0;
            roleRepo.transaction.mockImplementation(async (fn: (tx: never) => Promise<unknown>) => {
                if (++n === 1) throw deadlock;
                return fn(TX);
            });
            await expect(service.setStatus(input())).resolves.toMatchObject({ changed: true });
            expect(roleRepo.transaction).toHaveBeenCalledTimes(2);
        });

        it('a second conflict becomes 409 ROLE_CHANGE_CONFLICT', async () => {
            const { service, roleRepo } = setup();
            roleRepo.transaction.mockRejectedValue(deadlock);
            expect(await statusOf(service.setStatus(input()))).toEqual([409, 'ROLE_CHANGE_CONFLICT']);
            expect(roleRepo.transaction).toHaveBeenCalledTimes(2);
        });

        it('does not retry unrelated errors', async () => {
            const { service, roleRepo } = setup();
            roleRepo.transaction.mockRejectedValue(new Error('boom'));
            await expect(service.setStatus(input())).rejects.toThrow('boom');
            expect(roleRepo.transaction).toHaveBeenCalledTimes(1);
        });
    });
});
