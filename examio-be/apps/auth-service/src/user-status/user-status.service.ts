import {
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { GenerateIdService } from '@examio/common';
import { GatewayControlClient, sessionRevokeExp } from '../clients/gateway-control.client';
import { SessionRevokedPublisher } from '../devices/session-revoked.publisher';
import { AuthzChangedPublisher } from '../roles/authz-changed.publisher';
import { RoleChangeRepository, type AccountRow } from '../roles/role-change.repository';
import { UserStatusRepository } from './user-status.repository';

export interface SetStatusInput {
    /** Token `sub` of the verified caller; re-checked against the DB. */
    actorUserId: string;
    targetUserId: string;
    isBanned: boolean;
    reason?: string;
}

export interface SetStatusResult {
    user: AccountRow;
    /** false when the target already was in the requested state. */
    changed: boolean;
}

const body = (statusCode: number, code: string, message: string) => ({ statusCode, code, message });

function isConflict(err: unknown): boolean {
    const e = err as { code?: string; meta?: { code?: string }; message?: string } | null;
    if (!e) return false;
    if (e.code === 'P2034') return true;
    if (e.meta?.code === '40P01' || e.meta?.code === '40001') return true;
    return /\b(40P01|40001)\b|deadlock detected|could not serialize/i.test(e.message ?? '');
}

/**
 * Ban / unban. Same transaction discipline as RoleChangeService: the SAME
 * advisory lock serialises it with every role change, so the last active
 * SYSTEM_ADMIN cannot be removed by interleaving a demotion and a ban.
 * Bumps `authzVersion`, deactivates sessions on ban, and writes the
 * `authz_changed` event plus a RoleChangeLog row in the one transaction.
 */
@Injectable()
export class UserStatusService {
    private readonly logger = new Logger(UserStatusService.name);

    constructor(
        private readonly roles: RoleChangeRepository,
        private readonly status: UserStatusRepository,
        private readonly authz: AuthzChangedPublisher,
        private readonly sessionEvents: SessionRevokedPublisher,
        private readonly gateway: GatewayControlClient,
        private readonly ids: GenerateIdService
    ) {}

    async setStatus(input: SetStatusInput): Promise<SetStatusResult> {
        if (input.actorUserId === input.targetUserId) {
            throw new ForbiddenException(
                body(403, 'CANNOT_CHANGE_OWN_STATUS', 'You cannot ban or unban yourself')
            );
        }
        const { result, sids } = await this.runWithOneRetry(input);
        if (result.changed) {
            // After commit, fail-soft: the durable events cover a lost call.
            await this.gateway
                .invalidateUser(result.user.id, result.user.authzVersion)
                .catch((err) => this.logger.warn(`InvalidateUser failed after status change: ${String(err)}`));
            const exp = sessionRevokeExp();
            await Promise.all(
                sids.map((sid) =>
                    this.gateway
                        .revokeSession(sid, exp)
                        .catch((err) => this.logger.warn(`RevokeSession failed after ban: ${String(err)}`))
                )
            );
        }
        return result;
    }

    private async runWithOneRetry(input: SetStatusInput) {
        for (let attempt = 1; ; attempt++) {
            try {
                return await this.roles.transaction((tx) => this.apply(tx, input));
            } catch (err) {
                if (!isConflict(err)) throw err;
                if (attempt >= 2) {
                    throw new ConflictException(
                        body(409, 'ROLE_CHANGE_CONFLICT', 'Concurrent change, please retry')
                    );
                }
                this.logger.warn(`Status change conflict on attempt ${attempt}, retrying once`);
            }
        }
    }

    private async apply(
        tx: Parameters<Parameters<RoleChangeRepository['transaction']>[0]>[0],
        input: SetStatusInput
    ): Promise<{ result: SetStatusResult; sids: string[] }> {
        await this.roles.lock(tx);

        const actor = await this.roles.findActor(tx, input.actorUserId);
        if (!actor || !actor.isSystemAdmin || actor.isBanned || actor.deletedAt) {
            throw new ForbiddenException(
                body(403, 'PERMISSION_DENIED', 'Only an active SYSTEM_ADMIN can ban or unban users')
            );
        }

        const target = await this.roles.findTargetForUpdate(tx, input.targetUserId);
        // `deletedAt` without `isBanned` is a really deleted account. A banned
        // one may carry `deletedAt` from the pre-RBAC ban and must stay unbannable.
        if (!target || (target.deletedAt && !target.isBanned)) {
            throw new NotFoundException(body(404, 'USER_NOT_FOUND', 'User not found'));
        }

        if (target.isBanned === input.isBanned) {
            return { result: { user: target, changed: false }, sids: [] };
        }
        if (
            input.isBanned &&
            target.isSystemAdmin &&
            (await this.roles.countActiveAdmins(tx)) <= 1
        ) {
            throw new ConflictException(
                body(409, 'LAST_SYSTEM_ADMIN', 'The last SYSTEM_ADMIN cannot be banned')
            );
        }

        const user = await this.status.setBanned(tx, target.id, input.isBanned);
        const sessions = input.isBanned ? await this.status.deactivateSessions(tx, target.id) : [];
        const exp = sessionRevokeExp();
        for (const s of sessions) {
            await this.sessionEvents.publish(tx, { userId: target.id, sid: s.sessionId, exp });
        }

        const label = input.isBanned ? 'ban' : 'unban';
        await this.roles.insertLog(tx, {
            id: this.ids.generateId(),
            targetUserId: target.id,
            targetEmail: target.email,
            actorUserId: actor.id,
            actorEmail: actor.email,
            fromRole: target.role,
            toRole: target.role,
            fromAdmin: target.isSystemAdmin,
            toAdmin: target.isSystemAdmin,
            reason: input.reason ? `${label}: ${input.reason}` : label,
            source: 'admin-ui',
        });
        await this.authz.publish(tx, user, label);

        return { result: { user, changed: true }, sids: sessions.map((s) => s.sessionId) };
    }
}
