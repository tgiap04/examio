import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@examio/database';
import { RedisService } from '@examio/redis';

import {
    OverviewResponse,
    SeriesName,
    SeriesPoint,
    SeriesRange,
    SeriesResponse,
    fillDateGaps,
    rangeToDays,
    startOfNDaysAgo,
    startOfToday,
} from './admin-stats.types';

const OVERVIEW_CACHE_KEY = 'admin:stats:overview';
const SERIES_CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

@Injectable()
export class AdminStatsService {
    private readonly logger = new Logger(AdminStatsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService
    ) {}

    /**
     * Aggregated top-level KPIs for the admin overview page.
     * Cached for 5 minutes under `admin:stats:overview`.
     */
    async getOverview(): Promise<OverviewResponse> {
        const cached = await this.redis.get<OverviewResponse>(
            OVERVIEW_CACHE_KEY
        );
        if (cached) {
            return cached;
        }

        const todayStart = startOfToday();
        const thirtyDaysAgo = startOfNDaysAgo(30);

        // Run the four independent aggregate queries in parallel to minimize
        // wall-clock latency on a cold cache.
        const [
            totalUsers,
            activeToday,
            active30d,
            proCount,
            vipCount,
            revenueAgg,
        ] = await Promise.all([
            this.prisma.user.count(),
            this.prisma.userSession.count({
                where: { createdAt: { gte: todayStart } },
            }),
            this.prisma.userSession.count({
                where: { lastActivity: { gte: thirtyDaysAgo } },
            }),
            this.prisma.userSubscription.count({
                where: { tier: { in: [1, 2] }, isActive: true },
            }),
            this.prisma.userSubscription.count({
                where: { tier: 3, isActive: true },
            }),
            this.prisma.payment.aggregate({
                where: {
                    status: 1,
                    createdAt: { gte: thirtyDaysAgo },
                },
                _sum: { amount: true },
            }),
        ]);

        const overview: OverviewResponse = {
            totalUsers,
            activeToday,
            active30d,
            proCount,
            vipCount,
            revenue30d: Number(revenueAgg._sum.amount ?? 0),
        };

        await this.redis.set(
            OVERVIEW_CACHE_KEY,
            overview,
            SERIES_CACHE_TTL_SECONDS
        );
        return overview;
    }

    /**
     * Time series for one of {signups, traffic, revenue} across {7d, 30d, 90d}.
     * Bucketing is done in SQL via `date_trunc('day', ...)` and gaps are then
     * filled in TypeScript so the chart always receives N continuous points.
     */
    async getSeries(
        name: SeriesName,
        range: SeriesRange
    ): Promise<SeriesResponse> {
        const cacheKey = `admin:stats:series:${name}:${range}`;
        const cached = await this.redis.get<SeriesResponse>(cacheKey);
        if (cached) {
            return cached;
        }

        const start = startOfNDaysAgo(rangeToDays(range));
        const end = startOfToday();

        const points: SeriesPoint[] = (await this.fetchSeriesRaw(
            name,
            start
        )).map((row) => ({
            date: row.date.toISOString(),
            value: row.value,
        }));

        const filled = fillDateGaps(
            points.map((p) => ({ date: new Date(p.date), value: p.value })),
            start,
            end
        );

        const response: SeriesResponse = {
            name,
            range,
            bucket: 'day',
            points: filled,
        };

        await this.redis.set(cacheKey, response, SERIES_CACHE_TTL_SECONDS);
        return response;
    }

    /** Cache invalidation hooks for use by other modules (e.g. finance). */
    async invalidateOverview(): Promise<void> {
        await this.redis.del(OVERVIEW_CACHE_KEY);
    }

    async invalidateSeries(): Promise<void> {
        await this.redis.delPattern('admin:stats:series:*');
    }

    // ====================== private helpers ======================

    /**
     * Executes a single grouped aggregate query for the requested metric.
     * Uses `$queryRaw` with parameterized inputs so we can use `date_trunc`,
     * which Prisma's `groupBy` API does not support on standard fields.
     */
    private async fetchSeriesRaw(
        name: SeriesName,
        start: Date
    ): Promise<{ date: Date; value: number }[]> {
        switch (name) {
            case 'signups': {
                const rows = await this.prisma.$queryRaw<
                    { date: Date; value: bigint }[]
                >`
                    SELECT date_trunc('day', "createdAt") AS date,
                           COUNT(*) AS value
                    FROM "User"
                    WHERE "createdAt" >= ${start}
                    GROUP BY date
                    ORDER BY date ASC
                `;
                return rows.map((r) => ({ date: r.date, value: Number(r.value) }));
            }
            case 'traffic': {
                const rows = await this.prisma.$queryRaw<
                    { date: Date; value: bigint }[]
                >`
                    SELECT date_trunc('day', "lastActivity") AS date,
                           COUNT(*) AS value
                    FROM "UserSession"
                    WHERE "lastActivity" >= ${start}
                    GROUP BY date
                    ORDER BY date ASC
                `;
                return rows.map((r) => ({ date: r.date, value: Number(r.value) }));
            }
            case 'revenue': {
                const rows = await this.prisma.$queryRaw<
                    { date: Date; value: number | null }[]
                >`
                    SELECT date_trunc('day', "createdAt") AS date,
                           SUM("amount") AS value
                    FROM "Payment"
                    WHERE "status" = 1
                      AND "createdAt" >= ${start}
                    GROUP BY date
                    ORDER BY date ASC
                `;
                return rows.map((r) => ({
                    date: r.date,
                    value: Number(r.value ?? 0),
                }));
            }
        }
    }
}
