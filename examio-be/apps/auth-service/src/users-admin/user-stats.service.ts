import { Injectable } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { PrismaService } from '@examio/database';
import { authUsersV1 } from '@examio/contracts';
import { fail } from '../grpc/auth.grpc.errors';
import { dayKey, resolveDays, startOfNDaysAgo, startOfToday } from './stats-window';

/**
 * Aggregates for the admin overview. The queries are the ones admin-stats ran
 * against `User`/`UserSession` before phase 10, moved here unchanged so the KPI
 * numbers keep their meaning (a parity test pins them to a golden file).
 */
@Injectable()
export class UserStatsService {
    constructor(private readonly prisma: PrismaService) {}

    async getStats(req: authUsersV1.GetUserStatsRequest): Promise<authUsersV1.GetUserStatsResponse> {
        const days = resolveDays(req.days);
        if (days === null) fail(status.INVALID_ARGUMENT, 'days must be between 1 and 365');
        const utmDays = req.utmDays === undefined ? undefined : resolveDays(req.utmDays);
        if (utmDays === null) fail(status.INVALID_ARGUMENT, 'utm_days must be between 1 and 365');

        const start = startOfNDaysAgo(days!);
        const [totalUsers, activeToday, active30d, signups, traffic, utm] = await Promise.all([
            this.prisma.user.count(),
            this.prisma.userSession.count({ where: { createdAt: { gte: startOfToday() } } }),
            this.prisma.userSession.count({ where: { lastActivity: { gte: startOfNDaysAgo(30) } } }),
            this.prisma.$queryRaw<{ date: Date; value: bigint }[]>`
                SELECT date_trunc('day', "createdAt") AS date,
                       COUNT(*) AS value
                FROM "User"
                WHERE "createdAt" >= ${start}
                GROUP BY date
                ORDER BY date ASC
            `,
            this.prisma.$queryRaw<{ date: Date; value: bigint }[]>`
                SELECT date_trunc('day', "lastActivity") AS date,
                       COUNT(*) AS value
                FROM "UserSession"
                WHERE "lastActivity" >= ${start}
                GROUP BY date
                ORDER BY date ASC
            `,
            req.includeUtmSources ? this.utmBreakdown(utmDays ?? undefined) : Promise.resolve([]),
        ]);

        const point = (r: { date: Date; value: bigint }) => ({ date: dayKey(r.date), value: String(r.value) });
        return {
            totalUsers: String(totalUsers),
            activeToday: String(activeToday),
            activeLast30d: String(active30d),
            signupsSeries: signups.map(point),
            trafficSeries: traffic.map(point),
            utmSources: utm,
        };
    }

    private async utmBreakdown(utmDays?: number): Promise<authUsersV1.UtmBreakdown[]> {
        const rows = utmDays
            ? await this.prisma.$queryRaw<{ source: string; count: bigint }[]>`
                  SELECT COALESCE(NULLIF("utmSource", ''), 'direct') AS source,
                         COUNT(*) AS count
                  FROM "User"
                  WHERE "createdAt" >= ${startOfNDaysAgo(utmDays)}
                  GROUP BY 1
                  ORDER BY count DESC
                  LIMIT 20
              `
            : await this.prisma.$queryRaw<{ source: string; count: bigint }[]>`
                  SELECT COALESCE(NULLIF("utmSource", ''), 'direct') AS source,
                         COUNT(*) AS count
                  FROM "User"
                  GROUP BY 1
                  ORDER BY count DESC
                  LIMIT 20
              `;
        return rows.map((r) => ({ source: r.source, count: String(r.count) }));
    }
}
