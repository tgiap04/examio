import { Injectable } from '@nestjs/common';
import type { Prisma } from '../prisma';
import { OutboxService } from '@examio/messaging';
import type { UserUpdated } from '@examio/contracts/generated/examio/events/v1/auth_events';

export const USER_UPDATED = 'auth.user.updated';

/** Profile fields a `auth.user.updated` event can name in `changed`. */
export type UserChangedField = 'name' | 'bio' | 'avatar' | 'banner' | 'is_verified';

/**
 * `auth.user.updated` is a state event: `version` is the row's `updatedAt` in
 * epoch milliseconds, so consumers (exam's profile cache) apply it only if
 * newer. Always written inside the transaction that changed the row.
 */
@Injectable()
export class UserUpdatedPublisher {
    constructor(private readonly outbox: OutboxService) {}

    async publish(
        tx: Prisma.TransactionClient,
        user: { id: string; updatedAt: Date },
        changed: UserChangedField[]
    ): Promise<void> {
        const data: UserUpdated = {
            userId: user.id,
            changed,
            version: user.updatedAt.getTime(),
        };
        await this.outbox.add(tx, USER_UPDATED, data);
    }
}
