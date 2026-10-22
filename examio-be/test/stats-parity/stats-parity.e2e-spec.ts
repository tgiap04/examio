import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '@examio/database';
import type { RedisService } from '@examio/redis';
import { AdminStatsService } from '../../apps/admin-service/src/modules/admin-stats/admin-stats.service';
import { UserStatsService } from '../../apps/auth-service/src/users-admin/user-stats.service';
import { FinanceStatsService } from '../../apps/finance-service/src/modules/stats/finance-stats.service';
import { LegacyAdminStatsService } from './legacy-admin-stats.service';
import { FIXTURE_NOW, seedStatsFixture } from './fixture';

const GOLDEN = join(__dirname, 'golden.json');

/** In-memory stand-in for the 5-minute Redis cache (cache behaviour has its own spec). */
const noCache = { get: async () => null, set: async () => undefined, del: async () => undefined, delPattern: async () => undefined } as unknown as RedisService;

interface StatsLike {
    getOverview(): Promise<unknown>;
    getSeries(n: 'signups' | 'traffic' | 'revenue', r: '7d' | '30d' | '90d'): Promise<unknown>;
    getSourceBreakdown(r?: '7d' | '30d' | '90d'): Promise<unknown>;
}

async function snapshot(stats: StatsLike) {
    const out: Record<string, unknown> = { overview: await stats.getOverview() };
    for (const name of ['signups', 'traffic', 'revenue'] as const) {
        for (const range of ['7d', '30d', '90d'] as const) {
            out[`series:${name}:${range}`] = await stats.getSeries(name, range);
        }
    }
    out['sources:all'] = await stats.getSourceBreakdown();
    for (const range of ['7d', '30d', '90d'] as const) out[`sources:${range}`] = await stats.getSourceBreakdown(range);
    // `ORDER BY count DESC LIMIT 20` has no tiebreak (in the legacy SQL too): compare ties by source.
    for (const key of Object.keys(out).filter((k) => k.startsWith('sources:'))) {
        const sources = out[key] as { rows: Array<{ source: string; count: number }> };
        sources.rows.sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
    }
    return JSON.parse(JSON.stringify(out));
}

describe('admin stats parity (golden JSON from the pre-phase-10 service)', () => {
    let prisma: PrismaClient;
    beforeAll(async () => {
        prisma = new PrismaClient();
        // Only Date is faked: timers/IO must keep running for Prisma.
        jest.useFakeTimers({
            now: FIXTURE_NOW,
            doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'hrtime', 'performance', 'queueMicrotask'],
        });
        await seedStatsFixture(prisma);
    });
    afterAll(async () => {
        jest.useRealTimers();
        await prisma.$disconnect();
    });

    it('the frozen legacy service reproduces golden.json', async () => {
        const legacy = new LegacyAdminStatsService(prisma as unknown as PrismaService, noCache);
        const actual = await snapshot(legacy);
        if (process.env.UPDATE_GOLDEN === '1') writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`);
        expect(actual).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')));
    });

    it('admin stats over the real auth + finance SQL equals golden.json (overview, 9 series, 4 utm breakdowns)', async () => {
        const db = prisma as unknown as PrismaService;
        const users = new UserStatsService(db);
        const revenue = new FinanceStatsService(db);
        // The gRPC hop is covered by the contract specs; here the owners' SQL runs for real.
        const authUsers = { getUserStats: (req: never) => users.getStats(req) };
        const finance = { getRevenueStats: (req: never) => revenue.getRevenueStats(req) };
        const admin = new AdminStatsService(noCache, authUsers as never, finance as never);
        const md = {} as never;
        const adapter: StatsLike = {
            getOverview: () => admin.getOverview(md),
            getSeries: (n, r) => admin.getSeries(n, r, md),
            getSourceBreakdown: (r) => admin.getSourceBreakdown(md, r),
        };
        expect(await snapshot(adapter)).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')));
    });
});
