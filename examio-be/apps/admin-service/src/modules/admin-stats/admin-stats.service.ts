import { Injectable } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { RedisService } from '@examio/redis';

import { AuthUsersClient } from '../../clients/auth-users.client';
import { FinanceClient } from '../../clients/finance.client';
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
} from './admin-stats.types';

const OVERVIEW_CACHE_KEY = 'admin:stats:overview';
const SERIES_CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

/** `YYYY-MM-DD` (UTC) from an owner service -> UTC midnight. */
const utcMidnight = (day: string): Date => new Date(`${day}T00:00:00.000Z`);

/**
 * Admin dashboard numbers. The aggregates are computed by their owners (auth:
 * users/sessions/utm, finance: subscriptions/payments) and fetched with the
 * calling admin's token (`stats:read`); this service only combines them, fills
 * date gaps and keeps the 5-minute Redis cache. Response shapes are unchanged.
 */
@Injectable()
export class AdminStatsService {
    constructor(
        private readonly redis: RedisService,
        private readonly authUsers: AuthUsersClient,
        private readonly finance: FinanceClient
    ) {}

    /**
     * Aggregated top-level KPIs for the admin overview page.
     * Cached for 5 minutes under `admin:stats:overview`.
     */
    async getOverview(metadata: Metadata): Promise<OverviewResponse> {
        const cached = await this.redis.get<OverviewResponse>(OVERVIEW_CACHE_KEY);
        if (cached) return cached;

        const [users, revenue] = await Promise.all([
            this.authUsers.getUserStats({ days: 1, includeUtmSources: false }, metadata),
            this.finance.getRevenueStats({ days: 1 }, metadata),
        ]);
        const overview: OverviewResponse = {
            totalUsers: Number(users.totalUsers),
            activeToday: Number(users.activeToday),
            active30d: Number(users.activeLast30d),
            proCount: revenue.proUsers,
            vipCount: revenue.vipUsers,
            revenue30d: Number(revenue.revenueLast30d),
        };
        await this.redis.set(OVERVIEW_CACHE_KEY, overview, SERIES_CACHE_TTL_SECONDS);
        return overview;
    }

    /**
     * Time series for one of {signups, traffic, revenue} across {7d, 30d, 90d}.
     * Owners bucket by day in SQL; gaps are filled here so the chart always
     * receives N continuous points.
     */
    async getSeries(
        name: SeriesName,
        range: SeriesRange,
        metadata: Metadata
    ): Promise<SeriesResponse> {
        const cacheKey = `admin:stats:series:${name}:${range}`;
        const cached = await this.redis.get<SeriesResponse>(cacheKey);
        if (cached) return cached;

        const days = rangeToDays(range);
        const rows = await this.fetchSeries(name, days, metadata);
        const response: SeriesResponse = {
            name,
            range,
            bucket: 'day',
            points: fillDateGaps(rows, startOfNDaysAgo(days), startOfToday()),
        };
        await this.redis.set(cacheKey, response, SERIES_CACHE_TTL_SECONDS);
        return response;
    }

    /**
     * Signup attribution: user counts grouped by utm_source (null/'' -> 'direct'),
     * descending, top 20. No range = all time. Cached 5 minutes like the series.
     */
    async getSourceBreakdown(
        metadata: Metadata,
        range?: SeriesRange
    ): Promise<SourceBreakdownResponse> {
        const cacheKey = `admin:stats:sources:${range ?? 'all'}`;
        const cached = await this.redis.get<SourceBreakdownResponse>(cacheKey);
        if (cached) return cached;

        const users = await this.authUsers.getUserStats(
            {
                days: 1,
                includeUtmSources: true,
                utmDays: range ? rangeToDays(range) : undefined,
            },
            metadata
        );
        const response: SourceBreakdownResponse = {
            range: range ?? 'all',
            rows: users.utmSources.map((r) => ({ source: r.source, count: Number(r.count) })),
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

    private async fetchSeries(
        name: SeriesName,
        days: number,
        metadata: Metadata
    ): Promise<{ date: Date; value: number }[]> {
        if (name === 'revenue') {
            const { revenueSeries } = await this.finance.getRevenueStats({ days }, metadata);
            return revenueSeries.map((p) => ({ date: utcMidnight(p.date), value: Number(p.revenue) }));
        }
        const users = await this.authUsers.getUserStats(
            { days, includeUtmSources: false },
            metadata
        );
        const points: { date: string; value: string }[] =
            name === 'signups' ? users.signupsSeries : users.trafficSeries;
        return points.map((p) => ({ date: utcMidnight(p.date), value: Number(p.value) }));
    }
}
