import { Injectable } from '@nestjs/common';
import type { Prisma } from '../prisma';
import { OutboxService } from '@kmaedu/messaging';
import type { UserAuthzChanged } from '@kmaedu/contracts/generated/kmaedu/events/v1/auth_events';

export type AuthzChangeReason =
    | 'role'
    | 'admin'
    | 'password'
    | 'ban'
    | 'unban'
    | 'reapply';

export interface AuthzSnapshot {
    id: string;
    authzVersion: number;
    role: string;
    isSystemAdmin: boolean;
    isBanned: boolean;
}

export const AUTHZ_CHANGED = 'auth.user.authz_changed';

/** The only identity-authz event; always written inside the caller's transaction. */
@Injectable()
export class AuthzChangedPublisher {
    constructor(private readonly outbox: OutboxService) {}

    async publish(
        tx: Prisma.TransactionClient,
        user: AuthzSnapshot,
        reason: AuthzChangeReason
    ): Promise<void> {
        const data: UserAuthzChanged = {
            userId: user.id,
            authzVersion: user.authzVersion,
            role: user.role,
            isSystemAdmin: user.isSystemAdmin,
            isBanned: user.isBanned,
            reason,
            version: user.authzVersion,
        };
        await this.outbox.add(tx, AUTHZ_CHANGED, data);
    }
}
