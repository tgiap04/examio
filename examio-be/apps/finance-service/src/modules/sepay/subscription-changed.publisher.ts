import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { OutboxService } from '@examio/messaging';
import type { SubscriptionChanged } from '@examio/contracts/generated/examio/events/v1/finance_events';

export const SUBSCRIPTION_CHANGED = 'finance.subscription.changed';

/** Writes `finance.subscription.changed` in the caller's tx; no-op when the tier is unchanged. */
@Injectable()
export class SubscriptionChangedPublisher {
    constructor(private readonly outbox: OutboxService) {}

    async publish(
        tx: Prisma.TransactionClient,
        change: { userId: string; fromTier: number; toTier: number; updatedAt: Date }
    ): Promise<boolean> {
        if (change.fromTier === change.toTier) return false;
        const data: SubscriptionChanged = {
            userId: change.userId,
            fromTier: change.fromTier,
            toTier: change.toTier,
            at: Date.now(),
            version: change.updatedAt.getTime(),
        };
        await this.outbox.add(tx, SUBSCRIPTION_CHANGED, data);
        return true;
    }
}
