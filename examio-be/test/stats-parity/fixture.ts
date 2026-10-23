import type { PrismaClient as AuthClient } from '../../apps/auth-service/src/generated/prisma/client';
import type { PrismaClient as FinanceClient } from '../../apps/finance-service/src/generated/prisma/client';

/** auth owns users/sessions, finance owns subscriptions/payments/wallets: two databases. */
export interface StatsDbs {
    auth: AuthClient;
    finance: FinanceClient;
}

/** The frozen "now" of the parity run (a Sunday, mid-day UTC). */
export const FIXTURE_NOW = new Date('2026-03-15T10:30:00.000Z');

const DAY = 24 * 60 * 60 * 1000;
const at = (daysAgo: number, hour = 9) =>
    new Date(Date.UTC(2026, 2, 15 - daysAgo, hour, 0, 0));

/** Refuses to run against anything but a throwaway local database. */
export function assertLocalDatabase(): void {
    for (const name of ['AUTH_DATABASE_URL', 'FINANCE_DATABASE_URL']) {
        const url = process.env[name] ?? '';
        if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
            throw new Error(`stats parity resets tables: ${name} must be a local throwaway database`);
        }
    }
}

/**
 * Deterministic data covering every KPI: users with/without utm sources across
 * days (one pre-window), sessions created/active on different days, active +
 * inactive subscriptions in tiers 1..3, payments in every status.
 */
export async function seedStatsFixture({ auth: prisma, finance }: StatsDbs): Promise<void> {
    assertLocalDatabase();
    await prisma.$executeRawUnsafe('TRUNCATE "UserSession","User" CASCADE');
    await finance.$executeRawUnsafe('TRUNCATE "Payment","UserSubscription","Wallet" CASCADE');

    const users: Array<{ id: string; createdDaysAgo: number; utm: string | null }> = [
        { id: 'u1', createdDaysAgo: 0, utm: null },
        { id: 'u2', createdDaysAgo: 0, utm: 'google' },
        { id: 'u3', createdDaysAgo: 1, utm: 'google' },
        { id: 'u4', createdDaysAgo: 3, utm: 'facebook' },
        { id: 'u5', createdDaysAgo: 6, utm: '' },
        { id: 'u6', createdDaysAgo: 6, utm: 'tiktok' },
        { id: 'u7', createdDaysAgo: 20, utm: 'google' },
        { id: 'u8', createdDaysAgo: 29, utm: null },
        { id: 'u9', createdDaysAgo: 45, utm: 'facebook' },
        { id: 'u10', createdDaysAgo: 100, utm: 'google' },
    ];
    for (const u of users) {
        await prisma.user.create({
            data: {
                id: u.id,
                email: `${u.id}@parity.test`,
                username: u.id,
                utmSource: u.utm,
                createdAt: at(u.createdDaysAgo),
            },
        });
    }

    const sessions: Array<{ id: string; userId: string; createdDaysAgo: number; lastDaysAgo: number }> = [
        { id: 's1', userId: 'u1', createdDaysAgo: 0, lastDaysAgo: 0 },
        { id: 's2', userId: 'u2', createdDaysAgo: 0, lastDaysAgo: 0 },
        { id: 's3', userId: 'u3', createdDaysAgo: 1, lastDaysAgo: 0 },
        { id: 's4', userId: 'u4', createdDaysAgo: 5, lastDaysAgo: 2 },
        { id: 's5', userId: 'u4', createdDaysAgo: 5, lastDaysAgo: 2 },
        { id: 's6', userId: 'u7', createdDaysAgo: 28, lastDaysAgo: 28 },
        { id: 's7', userId: 'u8', createdDaysAgo: 40, lastDaysAgo: 29 },
        { id: 's8', userId: 'u9', createdDaysAgo: 60, lastDaysAgo: 31 },
        { id: 's9', userId: 'u10', createdDaysAgo: 90, lastDaysAgo: 80 },
    ];
    for (const s of sessions) {
        await prisma.userSession.create({
            data: {
                id: s.id,
                userId: s.userId,
                sessionId: `sid-${s.id}`,
                refreshToken: `rt-${s.id}`,
                deviceId: `dev-${s.id}`,
                createdAt: at(s.createdDaysAgo),
                lastActivity: at(s.lastDaysAgo, 15),
                expiresAt: new Date(FIXTURE_NOW.getTime() + 30 * DAY),
            },
        });
    }

    const subs: Array<{ id: string; userId: string; tier: number; isActive: boolean }> = [
        { id: 'sub1', userId: 'u1', tier: 1, isActive: true },
        { id: 'sub2', userId: 'u2', tier: 2, isActive: true },
        { id: 'sub3', userId: 'u3', tier: 3, isActive: true },
        { id: 'sub4', userId: 'u4', tier: 3, isActive: false },
        { id: 'sub5', userId: 'u5', tier: 0, isActive: true },
        { id: 'sub6', userId: 'u6', tier: 3, isActive: true },
    ];
    for (const s of subs) await finance.userSubscription.create({ data: s });

    const payments: Array<{ id: string; userId: string; amount: number; status: number; daysAgo: number }> = [
        { id: 'p1', userId: 'u1', amount: 100000, status: 1, daysAgo: 0 },
        { id: 'p2', userId: 'u2', amount: 50000, status: 1, daysAgo: 0 },
        { id: 'p3', userId: 'u3', amount: 200000, status: 1, daysAgo: 4 },
        { id: 'p4', userId: 'u4', amount: 75000, status: 0, daysAgo: 4 },
        { id: 'p5', userId: 'u5', amount: 30000, status: 4, daysAgo: 10 },
        { id: 'p6', userId: 'u6', amount: 120000, status: 1, daysAgo: 29 },
        { id: 'p7', userId: 'u7', amount: 999000, status: 1, daysAgo: 30 },
        { id: 'p8', userId: 'u8', amount: 60000, status: 1, daysAgo: 85 },
    ];
    for (const p of payments) {
        await finance.payment.create({
            data: {
                id: p.id,
                userId: p.userId,
                amount: p.amount,
                currency: 'VND',
                status: p.status,
                createdAt: at(p.daysAgo),
            },
        });
    }
}
