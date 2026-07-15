import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@examio/common';
import { PrismaService } from '@examio/database';
import { RedisService, EXPIRED_TIME } from '@examio/redis';
import { Payment } from '@prisma/client';

@Injectable()
export class PaymentRepository extends BaseRepository<Payment> {
    protected modelName = 'payment';
    protected cachePrefix = 'payment';
    protected defaultCacheTTL = EXPIRED_TIME.FIVE_MINUTES;

    constructor(prisma: PrismaService, redis: RedisService) {
        super(prisma, redis);
    }

    /**
     * Tìm payments theo user ID
     */
    async findByUserId(
        userId: string,
        cache = true,
        cacheTTL = this.defaultCacheTTL
    ): Promise<Payment[]> {
        return this.findAll({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            cache,
            cacheTTL,
        });
    }

    /**
     * Tìm pending payments
     */
    async findPendingByUser(
        userId: string,
        cache = false // Không cache pending payments
    ): Promise<Payment[]> {
        return this.findAll({
            where: {
                userId,
                status: 0, // 0: unpaid
            },
            orderBy: { createdAt: 'desc' },
            cache,
        });
    }

    /**
     * Tìm paid payments
     */
    async findPaidByUser(
        userId: string,
        cache = true,
        cacheTTL = EXPIRED_TIME.TEN_MINUTES
    ): Promise<Payment[]> {
        return this.findAll({
            where: {
                userId,
                status: 1, // 1: paid
            },
            orderBy: { createdAt: 'desc' },
            cache,
            cacheTTL,
        });
    }

    /**
     * Update payment status
     */
    async updateStatus(
        id: string,
        status: number,
        userId?: string
    ): Promise<Payment> {
        // BaseRepository.update() handles cache invalidation automatically
        return this.update(id, { status }, userId);
    }

    /**
     * Get payment statistics for user
     */
    async getUserStatistics(userId: string): Promise<{
        totalPaid: number;
        totalPending: number;
        paymentCount: number;
    }> {
        const cacheKey = this.getCacheKey(`stats:user:${userId}`);
        const cached = await this.redis.get<any>(cacheKey);
        if (cached) return cached;

        // Sum paid/pending amounts in the database instead of loading
        // every payment row to reduce it in JS
        const grouped = await this.model.groupBy({
            by: ['status'],
            where: { userId },
            _sum: { amount: true },
            _count: true,
        });

        const stats = grouped.reduce(
            (
                acc: {
                    totalPaid: number;
                    totalPending: number;
                    paymentCount: number;
                },
                row: {
                    status: number;
                    _sum: { amount: number | null };
                    _count: number;
                }
            ) => {
                const sum = row._sum.amount || 0;
                if (row.status === 1) {
                    // 1: paid
                    acc.totalPaid += sum;
                    acc.paymentCount += row._count;
                } else if (row.status === 0) {
                    // 0: unpaid (pending)
                    acc.totalPending += sum;
                    acc.paymentCount += row._count;
                }
                return acc;
            },
            { totalPaid: 0, totalPending: 0, paymentCount: 0 }
        );

        await this.redis.set(cacheKey, stats, EXPIRED_TIME.TEN_MINUTES);

        return stats;
    }
}
