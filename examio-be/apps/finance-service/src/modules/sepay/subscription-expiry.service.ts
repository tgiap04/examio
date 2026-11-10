import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { SubscriptionChangedPublisher } from './subscription-changed.publisher';

/**
 * The single place an expired-but-still-active subscription is flipped to inactive.
 * The conditional `updateMany` is the claim: when several callers (sweeper replicas, gRPC
 * and HTTP reads) observe the same expiry, exactly one flips the row and writes the
 * `finance.subscription.changed` (tier -> 0) outbox event, in the same transaction.
 */
@Injectable()
export class SubscriptionExpiryService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly changed: SubscriptionChangedPublisher
    ) {}

    /** Returns true only when this call performed the flip (and so published the event). */
    async expireIfLapsed(userId: string, now: Date = new Date()): Promise<boolean> {
        return this.prisma.$transaction(async (tx) => {
            const { count } = await tx.userSubscription.updateMany({
                where: { userId, isActive: true, nextPaymentDate: { lt: now } },
                data: { isActive: false },
            });
            if (count === 0) return false;
            const saved = await tx.userSubscription.findUniqueOrThrow({ where: { userId } });
            await this.changed.publish(tx, {
                userId,
                fromTier: saved.tier,
                toTier: 0,
                updatedAt: saved.updatedAt,
            });
            return true;
        });
    }

    /** Active rows whose paid period has lapsed, oldest first. */
    async findLapsedUserIds(limit: number, now: Date = new Date()): Promise<string[]> {
        const rows = await this.prisma.userSubscription.findMany({
            where: { isActive: true, nextPaymentDate: { lt: now } },
            select: { userId: true },
            orderBy: { nextPaymentDate: 'asc' },
            take: limit,
        });
        return rows.map((r) => r.userId);
    }
}
