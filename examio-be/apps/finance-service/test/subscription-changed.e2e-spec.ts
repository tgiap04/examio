import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { GenerateIdService } from '@examio/common';
import { PrismaModule, PrismaService } from '../src/prisma';
import { RedisModule } from '@examio/redis';
import { MessagingModule } from '@examio/messaging';
import { EnsureWalletService } from '../src/modules/wallet/ensure-wallet.service';
import { WalletMoneyService } from '../src/modules/wallet/wallet-money.service';
import { WalletRepository } from '../src/modules/wallet/wallet.repository';
import { SubscriptionChangedPublisher } from '../src/modules/sepay/subscription-changed.publisher';
import { SubscriptionService } from '../src/modules/sepay/subscription.service';
import { SubscriptionExpiryService } from '../src/modules/sepay/subscription-expiry.service';
import { SubscriptionExpirySweeper } from '../src/modules/sepay/subscription-expiry.sweeper';
import { FinanceAdminService } from '../src/modules/finance-admin/finance-admin.service';

/** `finance.subscription.changed` carries the EFFECTIVE tier (real Postgres + outbox). */
describe('finance.subscription.changed effective tier (e2e)', () => {
    let prisma: PrismaService;
    let subs: SubscriptionService;
    let sweeper: SubscriptionExpirySweeper;
    let admin: FinanceAdminService;
    const users: string[] = [];
    const ACTOR = 'admin-actor-sc';

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [PrismaModule, RedisModule, MessagingModule.forRoot({ service: 'finance' })],
            providers: [
                GenerateIdService,
                EnsureWalletService,
                WalletMoneyService,
                WalletRepository,
                SubscriptionChangedPublisher,
                SubscriptionExpiryService,
                SubscriptionExpirySweeper,
                SubscriptionService,
                FinanceAdminService,
            ],
        }).compile();
        await moduleRef.init();
        prisma = moduleRef.get(PrismaService);
        subs = moduleRef.get(SubscriptionService);
        sweeper = moduleRef.get(SubscriptionExpirySweeper);
        admin = moduleRef.get(FinanceAdminService);
    });

    afterAll(async () => {
        await prisma.outboxEvent.deleteMany({
            where: { type: 'finance.subscription.changed', envelope: { path: ['data', 'userId'], string_starts_with: 'sc_' } },
        });
        await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: { in: users } } } });
        await prisma.userSubscription.deleteMany({ where: { userId: { in: users } } });
        await prisma.wallet.deleteMany({ where: { userId: { in: users } } });
        await prisma.$disconnect();
    });

    const newUser = () => {
        const id = `sc_${randomUUID().replace(/-/g, '').slice(0, 18)}`;
        users.push(id);
        return id;
    };
    const data = async (u: string) =>
        (
            await prisma.outboxEvent.findMany({
                where: { type: 'finance.subscription.changed', envelope: { path: ['data', 'userId'], equals: u } },
                orderBy: { createdAt: 'asc' },
            })
        ).map((e) => (e.envelope as { data: { fromTier: number; toTier: number } }).data);

    const seedExpired = async (u: string, key: string) => {
        await admin.changeTier({ userId: u, tier: 2, billingCycle: 'monthly', reason: 'seed active tier', idempotencyKey: key }, ACTOR);
        await prisma.userSubscription.update({ where: { userId: u }, data: { nextPaymentDate: new Date(Date.now() - 60_000) } });
    };
    const row = (u: string) => prisma.userSubscription.findUniqueOrThrow({ where: { userId: u } });
    const tierEvents = (u: string) => data(u).then((d) => d.filter((e) => e.toTier === 0));

    it('GetUserBenefits on an expired row flips it and publishes tier 2 -> 0 once, even for concurrent callers', async () => {
        const u = newUser();
        await seedExpired(u, `e1${u}`);

        const results = await Promise.all([1, 2, 3].map(() => subs.getUserSubscriptionBenefits(u)));
        for (const r of results) expect(r.name).not.toBe('Advanced');
        expect((await row(u)).isActive).toBe(false);
        expect(await data(u)).toEqual([expect.objectContaining({ fromTier: 0, toTier: 2 }), expect.objectContaining({ fromTier: 2, toTier: 0 })]);

        await subs.getUserSubscriptionBenefits(u);
        expect(await data(u)).toHaveLength(2);
    });

    it('GET /payment/subscription path reports isActive=false after expiry and publishes once', async () => {
        const u = newUser();
        await seedExpired(u, `g1${u}`);
        const [a, b] = await Promise.all([subs.getSubscription(u), subs.getSubscription(u)]);
        expect(a.isActive).toBe(false);
        expect(b.isActive).toBe(false);
        expect((await row(u)).isActive).toBe(false);
        expect(await tierEvents(u)).toEqual([expect.objectContaining({ fromTier: 2, toTier: 0 })]);
    });

    it('sweeper flips an expired row, publishes exactly one tier 2 -> 0 event, and a second tick publishes nothing', async () => {
        const u = newUser();
        await seedExpired(u, `w1${u}`);

        expect(await sweeper.tick()).toBeGreaterThanOrEqual(1);
        expect((await row(u)).isActive).toBe(false);
        expect(await tierEvents(u)).toEqual([expect.objectContaining({ fromTier: 2, toTier: 0 })]);

        await sweeper.tick();
        expect(await tierEvents(u)).toHaveLength(1);
    });

    it('concurrent sweepers and readers still produce one event', async () => {
        const u = newUser();
        await seedExpired(u, `w2${u}`);
        await Promise.all([sweeper.tick(), subs.getUserSubscriptionBenefits(u), subs.getSubscription(u)]);
        expect(await tierEvents(u)).toHaveLength(1);
    });

    it('an active row with a future date is untouched by sweeper and reads', async () => {
        const u = newUser();
        await admin.changeTier({ userId: u, tier: 2, billingCycle: 'monthly', reason: 'seed active tier', idempotencyKey: `f1${u}` }, ACTOR);
        const before = await row(u);
        await sweeper.tick();
        expect((await subs.getUserSubscriptionBenefits(u)).name).toBe('Advanced');
        expect((await subs.getSubscription(u)).isActive).toBe(true);
        const after = await row(u);
        expect(after.isActive).toBe(true);
        expect(after.updatedAt).toEqual(before.updatedAt);
        expect(await data(u)).toHaveLength(1);
    });

    it('admin reactivation of an expired same-tier subscription publishes the tier', async () => {
        const u = newUser();
        await admin.changeTier({ userId: u, tier: 3, billingCycle: 'monthly', reason: 'seed active tier', idempotencyKey: `r1${u}` }, ACTOR);
        await prisma.userSubscription.update({ where: { userId: u }, data: { isActive: false } });
        await admin.changeTier({ userId: u, tier: 3, billingCycle: 'monthly', reason: 'renew after expiry', idempotencyKey: `r2${u}` }, ACTOR);
        expect(await data(u)).toEqual([expect.objectContaining({ fromTier: 0, toTier: 3 }), expect.objectContaining({ fromTier: 0, toTier: 3 })]);
    });

    it('payment activation of an expired same-tier subscription publishes the tier', async () => {
        const u = newUser();
        await subs.activateSubscription(u, 1, 'monthly');
        await prisma.userSubscription.update({ where: { userId: u }, data: { nextPaymentDate: new Date(Date.now() - 60_000) } });
        await subs.activateSubscription(u, 1, 'monthly');
        expect(await data(u)).toEqual([expect.objectContaining({ fromTier: 0, toTier: 1 }), expect.objectContaining({ fromTier: 0, toTier: 1 })]);
    });

    it('re-saving the same active tier publishes nothing', async () => {
        const u = newUser();
        await admin.changeTier({ userId: u, tier: 2, billingCycle: 'monthly', reason: 'seed active tier', idempotencyKey: `s1${u}` }, ACTOR);
        await admin.changeTier({ userId: u, tier: 2, billingCycle: 'yearly', reason: 'cycle change only', idempotencyKey: `s2${u}` }, ACTOR);
        await subs.activateSubscription(u, 2, 'monthly');
        expect(await data(u)).toHaveLength(1);
    });

    it('a downgrade through an inactive row reports effective tier 0, not the stored tier', async () => {
        const u = newUser();
        await admin.changeTier({ userId: u, tier: 2, billingCycle: 'monthly', reason: 'seed active tier', idempotencyKey: `d1${u}` }, ACTOR);
        await admin.changeTier({ userId: u, tier: 0, billingCycle: '', reason: 'cancel subscription', idempotencyKey: `d2${u}` }, ACTOR);
        expect(await data(u)).toEqual([expect.objectContaining({ fromTier: 0, toTier: 2 }), expect.objectContaining({ fromTier: 2, toTier: 0 })]);
    });
});
