import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../prisma';
import { OutboxService } from '@examio/messaging';
import type { SubscriptionChanged } from '@examio/contracts/generated/examio/events/v1/finance_events';

export const SUBSCRIPTION_CHANGED = 'finance.subscription.changed';

/**
 * The tier a consumer should act on: an inactive or expired subscription is tier 0
 * whatever tier is stored. `finance.subscription.changed` carries this, never the stored tier.
 */
export function effectiveTier(
    sub: { tier: number; isActive: boolean; nextPaymentDate: Date | null } | null | undefined,
    now: Date = new Date()
): number {
    if (!sub || !sub.isActive) return 0;
    if (sub.nextPaymentDate && sub.nextPaymentDate < now) return 0;
    return sub.tier;
}

/**
 * Writes `finance.subscription.changed` in the caller's tx. `fromTier`/`toTier` are EFFECTIVE
 * tiers (see `effectiveTier`); no-op when the effective tier does not change.
 */
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
