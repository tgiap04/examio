/**
 * FROZEN COPY of admin-stats.service.ts as of phase 10 step 9 (before the
 * service switched to GetUserStats + GetRevenueStats). It is the oracle for
 * the stats parity test and must never be edited: golden.json was captured
 * from it.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@examio/database';
import { RedisService } from '@examio/redis';

import {
    OverviewResponse,
    SeriesName,
    SeriesPoint,
    SeriesRange,
    SeriesResponse,
    SourceBreakdownResponse,
    fillDateGaps,
    rangeToDays,
    startOfNDaysAgo,
    startOfToday,
} from '../../apps/admin-service/src/modules/admin-stats/admin-stats.types';

const OVERVIEW_CACHE_KEY = 'admin:stats:overview';
const SERIES_CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

@Injectable()
export class LegacyAdminStatsService {
    private readonly logger = new Logger(LegacyAdminStatsService.name);

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

    /**
     * Quy kết nguồn đăng ký: đếm User theo utm_source (null/'' → 'direct'),
     * giảm dần, top 20. range không truyền → toàn thời gian; có range → lọc theo
     * createdAt. Cache 5' theo mẫu series.
     */
    async getSourceBreakdown(
        range?: SeriesRange
    ): Promise<SourceBreakdownResponse> {
        const cacheKey = `admin:stats:sources:${range ?? 'all'}`;
        const cached =
            await this.redis.get<SourceBreakdownResponse>(cacheKey);
        if (cached) {
            return cached;
        }

        const rows = range
            ? await this.prisma.$queryRaw<
                  { source: string; count: bigint }[]
              >`
                    SELECT COALESCE(NULLIF("utmSource", ''), 'direct') AS source,
                           COUNT(*) AS count
                    FROM "User"
                    WHERE "createdAt" >= ${startOfNDaysAgo(rangeToDays(range))}
                    GROUP BY 1
                    ORDER BY count DESC
                    LIMIT 20
                `
            : await this.prisma.$queryRaw<
                  { source: string; count: bigint }[]
              >`
                    SELECT COALESCE(NULLIF("utmSource", ''), 'direct') AS source,
                           COUNT(*) AS count
                    FROM "User"
                    GROUP BY 1
                    ORDER BY count DESC
                    LIMIT 20
                `;

        const response: SourceBreakdownResponse = {
            range: range ?? 'all',
            rows: rows.map((r) => ({
                source: r.source,
                count: Number(r.count),
            })),
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
