import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createPrismaAdapter as authAdapter } from '../../apps/auth-service/src/prisma/create-prisma-adapter';
import { createPrismaAdapter as financeAdapter } from '../../apps/finance-service/src/prisma/create-prisma-adapter';
import { PrismaClient as AuthClient } from '../../apps/auth-service/src/generated/prisma/client';
import { PrismaClient as FinanceClient } from '../../apps/finance-service/src/generated/prisma/client';
import type { PrismaService as AuthPrisma } from '../../apps/auth-service/src/prisma';
import type { PrismaService as FinancePrisma } from '../../apps/finance-service/src/prisma';
import type { RedisService } from '@examio/redis';
import { AdminStatsService } from '../../apps/admin-service/src/modules/admin-stats/admin-stats.service';
import { UserStatsService } from '../../apps/auth-service/src/users-admin/user-stats.service';
import { FinanceStatsService } from '../../apps/finance-service/src/modules/stats/finance-stats.service';
import { LegacyAdminStatsService, type LegacyStatsDb } from './legacy-admin-stats.service';
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
    let auth: AuthClient;
    let finance: FinanceClient;
    beforeAll(async () => {
        const url = (name: string) => {
            const v = process.env[name];
            if (!v) throw new Error(`${name} is required (local throwaway database)`);
            return v;
        };
        auth = new AuthClient({ adapter: authAdapter(url('AUTH_DATABASE_URL')) });
        finance = new FinanceClient({ adapter: financeAdapter(url('FINANCE_DATABASE_URL')) });
        // Only Date is faked: timers/IO must keep running for Prisma.
        jest.useFakeTimers({
            now: FIXTURE_NOW,
            doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'hrtime', 'performance', 'queueMicrotask'],
        });
        await seedStatsFixture({ auth, finance });
    });
    afterAll(async () => {
        jest.useRealTimers();
        await auth.$disconnect();
        await finance.$disconnect();
    });

    it('the frozen legacy service reproduces golden.json', async () => {
        const legacyDb = {
            user: auth.user,
            userSession: auth.userSession,
            userSubscription: finance.userSubscription,
            payment: finance.payment,
            // Every legacy raw query reads exactly one table: route by the table it names.
            $queryRaw: ((strings: TemplateStringsArray, ...values: unknown[]) =>
                (strings.join('?').includes('"Payment"') ? finance : auth).$queryRaw(strings, ...values)) as AuthClient['$queryRaw'],
        } as unknown as LegacyStatsDb;
        const legacy = new LegacyAdminStatsService(legacyDb, noCache);
        const actual = await snapshot(legacy);
        if (process.env.UPDATE_GOLDEN === '1') writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`);
        expect(actual).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')));
    });

    it('admin stats over the real auth + finance SQL equals golden.json (overview, 9 series, 4 utm breakdowns)', async () => {
        const users = new UserStatsService(auth as unknown as AuthPrisma);
        const revenue = new FinanceStatsService(finance as unknown as FinancePrisma);
        // The gRPC hop is covered by the contract specs; here the owners' SQL runs for real.
        const authUsers = { getUserStats: (req: never) => users.getStats(req) };
        const financeRpc = { getRevenueStats: (req: never) => revenue.getRevenueStats(req) };
        const admin = new AdminStatsService(noCache, authUsers as never, financeRpc as never);
        const md = {} as never;
        const adapter: StatsLike = {
            getOverview: () => admin.getOverview(md),
            getSeries: (n, r) => admin.getSeries(n, r, md),
            getSourceBreakdown: (r) => admin.getSourceBreakdown(md, r),
        };
        expect(await snapshot(adapter)).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')));
    });
});
