import { Injectable } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '@examio/database';
import { financeAdminV1 } from '@examio/contracts';
import { dayKey, resolveDays, startOfNDaysAgo } from './stats-window';

/** Payment.status of a settled payment (see payment.prisma). */
const PAYMENT_PAID = 1;

/**
 * Revenue/subscription aggregates for the admin overview. The queries are the
 * ones admin-stats ran against `UserSubscription`/`Payment` before phase 10,
 * moved here unchanged (a parity test pins them to a golden file).
 */
@Injectable()
export class FinanceStatsService {
    constructor(private readonly prisma: PrismaService) {}

    async getRevenueStats(
        req: financeAdminV1.GetRevenueStatsRequest
    ): Promise<financeAdminV1.GetRevenueStatsResponse> {
        const days = resolveDays(req.days);
        if (days === null) {
            throw new RpcException({ code: status.INVALID_ARGUMENT, message: 'days must be between 1 and 365' });
        }
        const start = startOfNDaysAgo(days);
        const [proUsers, vipUsers, revenueAgg, series] = await Promise.all([
            this.prisma.userSubscription.count({ where: { tier: { in: [1, 2] }, isActive: true } }),
            this.prisma.userSubscription.count({ where: { tier: 3, isActive: true } }),
            this.prisma.payment.aggregate({
                where: { status: PAYMENT_PAID, createdAt: { gte: startOfNDaysAgo(30) } },
                _sum: { amount: true },
            }),
            this.prisma.$queryRaw<{ date: Date; value: number | null }[]>`
                SELECT date_trunc('day', "createdAt") AS date,
                       SUM("amount") AS value
                FROM "Payment"
                WHERE "status" = 1
                  AND "createdAt" >= ${start}
                GROUP BY date
                ORDER BY date ASC
            `,
        ]);
        return {
            proUsers,
            vipUsers,
            revenueLast30d: String(Number(revenueAgg._sum.amount ?? 0)),
            revenueSeries: series.map((r) => ({
                date: dayKey(r.date),
                revenue: String(Number(r.value ?? 0)),
            })),
        };
    }
}
