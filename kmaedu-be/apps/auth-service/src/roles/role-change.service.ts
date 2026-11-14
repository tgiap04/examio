import {
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { GenerateIdService } from '@kmaedu/common';
import { GatewayControlClient } from '../clients/gateway-control.client';
import { AuthzChangedPublisher, type AuthzChangeReason } from './authz-changed.publisher';
import {
    RoleChangeRepository,
    type AccountRow,
    type BaseRoleName,
} from './role-change.repository';

export type RoleChangeSource = 'admin-ui' | 'cli' | 'bootstrap';

export type RoleChangeActor =
    /** A verified SYSTEM_ADMIN user (id = token `sub`); re-checked against the DB. */
    | { kind: 'user'; userId: string }
    /** The CLI/bootstrap system actor: actor checks skipped, lock + last-admin guard kept. */
    | { kind: 'system'; email: string };

export interface RoleChangeInput {
    actor: RoleChangeActor;
    targetUserId: string;
    /** Desired values; omitted = keep the current one. */
    role?: BaseRoleName;
    isSystemAdmin?: boolean;
    reason?: string;
    source: RoleChangeSource;
}

export interface RoleChangeResult {
    user: AccountRow;
    /** false for a re-apply (same values): only a log row + event were written. */
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
 * The single path for role / admin-flag changes (admin UI over gRPC, CLI,
 * bootstrap). One transaction, serialized by an advisory lock, so the last
 * SYSTEM_ADMIN cannot be removed concurrently and a token is never signed
 * with roles older than its `av`.
 */
@Injectable()
export class RoleChangeService {
    private readonly logger = new Logger(RoleChangeService.name);

    constructor(
        private readonly repo: RoleChangeRepository,
        private readonly publisher: AuthzChangedPublisher,
        private readonly gateway: GatewayControlClient,
        private readonly ids: GenerateIdService
    ) {}

    async change(input: RoleChangeInput): Promise<RoleChangeResult> {
        if (input.actor.kind === 'user' && input.actor.userId === input.targetUserId) {
            throw new ForbiddenException(
                body(403, 'CANNOT_CHANGE_OWN_ROLE', 'You cannot change your own role')
            );
        }

        const result = await this.runWithOneRetry(input);

        if (result.changed) {
            // After commit, fail-soft: the durable event covers a lost call.
            await this.gateway
                .invalidateUser(result.user.id, result.user.authzVersion)
                .catch((err) =>
                    this.logger.warn(`InvalidateUser failed after role change: ${String(err)}`)
                );
        }
        return result;
    }

    private async runWithOneRetry(input: RoleChangeInput): Promise<RoleChangeResult> {
        for (let attempt = 1; ; attempt++) {
            try {
                return await this.repo.transaction((tx) => this.apply(tx, input));
            } catch (err) {
                if (!isConflict(err)) throw err;
                if (attempt >= 2) {
                    throw new ConflictException(
                        body(409, 'ROLE_CHANGE_CONFLICT', 'Concurrent role change, please retry')
                    );
                }
                this.logger.warn(`Role change conflict on attempt ${attempt}, retrying once`);
            }
        }
    }

    private async apply(
        tx: Parameters<Parameters<RoleChangeRepository['transaction']>[0]>[0],
        input: RoleChangeInput
    ): Promise<RoleChangeResult> {
        await this.repo.lock(tx);

        const actor = await this.resolveActor(tx, input.actor);

        const target = await this.repo.findTargetForUpdate(tx, input.targetUserId);
        if (!target || target.deletedAt) {
            throw new NotFoundException(body(404, 'USER_NOT_FOUND', 'User not found'));
        }

        const toRole = input.role ?? target.role;
        const toAdmin = input.isSystemAdmin ?? target.isSystemAdmin;

        const demotesActiveAdmin =
            target.isSystemAdmin && !toAdmin && !target.isBanned;
        if (demotesActiveAdmin && (await this.repo.countActiveAdmins(tx)) <= 1) {
            throw new ConflictException(
                body(409, 'LAST_SYSTEM_ADMIN', 'The last SYSTEM_ADMIN cannot be demoted')
            );
        }

        const unchanged = toRole === target.role && toAdmin === target.isSystemAdmin;
        const user = unchanged
            ? target
            : await this.repo.updateAccount(tx, target.id, { role: toRole, isSystemAdmin: toAdmin });

        await this.repo.insertLog(tx, {
            id: this.ids.generateId(),
            targetUserId: target.id,
            targetEmail: target.email,
            actorUserId: actor.userId,
            actorEmail: actor.email,
            fromRole: target.role,
            toRole,
            fromAdmin: target.isSystemAdmin,
            toAdmin,
            reason: unchanged ? this.reapplyReason(input.reason) : (input.reason ?? null),
            source: input.source,
        });

        const reason: AuthzChangeReason = unchanged
            ? 'reapply'
            : toRole !== target.role
              ? 'role'
              : 'admin';
        await this.publisher.publish(tx, user, reason);

        return { user, changed: !unchanged };
    }

    private reapplyReason(reason?: string): string {
        return reason ? `reapply: ${reason}` : 'reapply';
    }

    private async resolveActor(
        tx: Parameters<RoleChangeRepository['findActor']>[0],
        actor: RoleChangeActor
    ): Promise<{ userId: string | null; email: string }> {
        if (actor.kind === 'system') return { userId: null, email: actor.email };
        const row = await this.repo.findActor(tx, actor.userId);
        if (!row || !row.isSystemAdmin || row.isBanned || row.deletedAt) {
            throw new ForbiddenException(
                body(403, 'PERMISSION_DENIED', 'Only an active SYSTEM_ADMIN can change roles')
            );
        }
        return { userId: row.id, email: row.email };
    }
}
