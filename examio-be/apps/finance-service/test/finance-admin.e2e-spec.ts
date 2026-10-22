import { randomUUID } from 'crypto';
import { status } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { GenerateIdService } from '@examio/common';
import { DatabaseModule, PrismaService } from '@examio/database';
import { RedisModule } from '@examio/redis';
import { MessagingModule } from '@examio/messaging';
import { EnsureWalletService } from '../src/modules/wallet/ensure-wallet.service';
import { WalletMoneyService } from '../src/modules/wallet/wallet-money.service';
import { SubscriptionChangedPublisher } from '../src/modules/sepay/subscription-changed.publisher';
import { FinanceAdminService } from '../src/modules/finance-admin/finance-admin.service';

/** FinanceAdminService against a REAL Postgres (money + outbox in one tx). */
describe('FinanceAdminService (e2e, real Postgres)', () => {
    let prisma: PrismaService;
    let admin: FinanceAdminService;
    const users: string[] = [];
    const ACTOR = 'admin-actor-1';

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [DatabaseModule, RedisModule, MessagingModule.forRoot({ service: 'finance' })],
            providers: [
                GenerateIdService,
                EnsureWalletService,
                WalletMoneyService,
                SubscriptionChangedPublisher,
                FinanceAdminService,
            ],
        }).compile();
        await moduleRef.init();
        prisma = moduleRef.get(PrismaService);
        admin = moduleRef.get(FinanceAdminService);
    });

    afterAll(async () => {
        await prisma.outboxEvent.deleteMany({
            where: { type: 'finance.subscription.changed', envelope: { path: ['data', 'userId'], string_starts_with: 'fa_' } },
        });
        await prisma.payment.deleteMany({ where: { userId: { in: users } } });
        await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: { in: users } } } });
        await prisma.userSubscription.deleteMany({ where: { userId: { in: users } } });
        await prisma.wallet.deleteMany({ where: { userId: { in: users } } });
        await prisma.user.deleteMany({ where: { id: { in: users } } });
        await prisma.$disconnect();
    });

    async function user(balance: number | null = 50) {
        const id = `fa_${randomUUID().replace(/-/g, '').slice(0, 18)}`;
        users.push(id);
        await prisma.user.create({ data: { id, email: `${id}@e2e.test`, username: id, role: 'TEACHER' } });
        if (balance !== null) await prisma.wallet.create({ data: { id: `w_${id}`, userId: id, balance } });
        return id;
    }
    async function payment(userId: string, over: Partial<{ status: number; paymentType: string; amount: number }> = {}) {
        const id = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
        await prisma.payment.create({
            data: { id, userId, amount: over.amount ?? 30, currency: 'VND', status: over.status ?? 1, paymentType: over.paymentType ?? 'credits' },
        });
        return id;
    }
    const balanceOf = async (u: string) => (await prisma.wallet.findUniqueOrThrow({ where: { userId: u } })).balance;
    const fail = (p: Promise<unknown>) => p.then(() => null, (e) => e);
    const code = (e: { getError(): { code: number; message: string } }) => e.getError();

    describe('adjustBalance', () => {
        it('ADD then SUBTRACT, previous/new balance reported, actor recorded', async () => {
            const u = await user(50);
            const add = await admin.adjustBalance({ userId: u, amount: 10, direction: 'ADD', reason: 'goodwill gift', idempotencyKey: 'a1' }, ACTOR);
            expect(add).toMatchObject({ previousBalance: 50, newBalance: 60, direction: 'ADD', alreadyApplied: false });
            const sub = await admin.adjustBalance({ userId: u, amount: 5, direction: 'SUBTRACT', reason: 'correction here', idempotencyKey: 'a2' }, ACTOR);
            expect(sub).toMatchObject({ previousBalance: 60, newBalance: 55 });
            const row = await prisma.walletTransaction.findFirstOrThrow({ where: { wallet: { userId: u }, idempotencyKey: 'adjust:a1' } });
            expect(row).toMatchObject({ type: 3, createdBy: ACTOR, updatedBy: ACTOR });
        });

        it('the same idempotency key twice -> ONE transaction, second already_applied', async () => {
            const u = await user(50);
            const req = { userId: u, amount: 10, direction: 'ADD', reason: 'goodwill gift', idempotencyKey: 'same' };
            const a = await admin.adjustBalance(req, ACTOR);
            const b = await admin.adjustBalance(req, ACTOR);
            expect([a.alreadyApplied, b.alreadyApplied]).toEqual([false, true]);
            expect(b.newBalance).toBe(60);
            expect(await balanceOf(u)).toBe(60);
            expect(await prisma.walletTransaction.count({ where: { wallet: { userId: u }, idempotencyKey: 'adjust:same' } })).toBe(1);
        });

        it('SUBTRACT beyond the balance is FAILED_PRECONDITION INSUFFICIENT_CREDITS', async () => {
            const u = await user(5);
            const err = await fail(admin.adjustBalance({ userId: u, amount: 9, direction: 'SUBTRACT', reason: 'too much', idempotencyKey: 'x' }, ACTOR));
            expect(code(err)).toMatchObject({ code: status.FAILED_PRECONDITION, message: 'INSUFFICIENT_CREDITS' });
            expect(await balanceOf(u)).toBe(5);
        });

        it('a user without a wallet is NOT_FOUND', async () => {
            const u = await user(null);
            const err = await fail(admin.adjustBalance({ userId: u, amount: 1, direction: 'ADD', reason: 'whatever it is', idempotencyKey: 'n' }, ACTOR));
            expect(code(err)).toMatchObject({ code: status.NOT_FOUND, message: 'WALLET_NOT_FOUND' });
        });

        it('replaying a key with a different amount is IDEMPOTENCY_KEY_REUSED, not a fabricated balance (M1)', async () => {
            const u = await user(50);
            await admin.adjustBalance({ userId: u, amount: 10, direction: 'ADD', reason: 'goodwill gift', idempotencyKey: 'mm' }, ACTOR);
            const err = await fail(admin.adjustBalance({ userId: u, amount: 25, direction: 'ADD', reason: 'goodwill gift', idempotencyKey: 'mm' }, ACTOR));
            expect(code(err)).toMatchObject({ code: status.FAILED_PRECONDITION, message: 'IDEMPOTENCY_KEY_REUSED' });
            expect(await balanceOf(u)).toBe(60);
        });

        it('rejects a bad direction', async () => {
            const u = await user(5);
            const err = await fail(admin.adjustBalance({ userId: u, amount: 1, direction: 'SIDEWAYS', reason: 'whatever it is', idempotencyKey: 'd' }, ACTOR));
            expect(code(err).code).toBe(status.INVALID_ARGUMENT);
        });
    });

    describe('refundPayment', () => {
        it('refunds a paid credits payment, reverses the wallet (clamped at 0)', async () => {
            const u = await user(20);
            const p = await payment(u, { amount: 30 });
            const r = await admin.refundPayment({ paymentId: p, reason: 'customer request', idempotencyKey: 'r1' }, ACTOR);
            expect(r).toMatchObject({ paymentId: p, userId: u, amount: 30, previousStatus: 1, newStatus: 4, walletAdjusted: true, alreadyApplied: false });
            expect(await balanceOf(u)).toBe(0);
            expect((await prisma.payment.findUniqueOrThrow({ where: { id: p } })).status).toBe(4);
        });

        it('a subscription payment does not touch the wallet', async () => {
            const u = await user(20);
            const p = await payment(u, { paymentType: 'subscription' });
            const r = await admin.refundPayment({ paymentId: p, reason: 'customer request', idempotencyKey: 'r2' }, ACTOR);
            expect(r.walletAdjusted).toBe(false);
            expect(await balanceOf(u)).toBe(20);
        });

        it('the same key replays as already_applied; another key on a refunded payment is FAILED_PRECONDITION', async () => {
            const u = await user(100);
            const p = await payment(u, { amount: 30 });
            await admin.refundPayment({ paymentId: p, reason: 'customer request', idempotencyKey: 'r3' }, ACTOR);
            const again = await admin.refundPayment({ paymentId: p, reason: 'customer request', idempotencyKey: 'r3' }, ACTOR);
            expect(again.alreadyApplied).toBe(true);
            expect(await balanceOf(u)).toBe(70);
            const err = await fail(admin.refundPayment({ paymentId: p, reason: 'customer request', idempotencyKey: 'r4' }, ACTOR));
            expect(code(err)).toMatchObject({ code: status.FAILED_PRECONDITION, message: 'PAYMENT_ALREADY_REFUNDED' });
            expect(await balanceOf(u)).toBe(70);
        });

        it('replaying a refunded SUBSCRIPTION payment with the same key is already_applied, not 409 (M4)', async () => {
            const u = await user(20);
            const p = await payment(u, { paymentType: 'subscription' });
            const first = await admin.refundPayment({ paymentId: p, reason: 'customer request', idempotencyKey: 'm4a' }, ACTOR);
            const again = await admin.refundPayment({ paymentId: p, reason: 'customer request', idempotencyKey: 'm4a' }, ACTOR);
            expect(first.alreadyApplied).toBe(false);
            expect(again).toMatchObject({ alreadyApplied: true, walletAdjusted: false, paymentId: p });
            const err = await fail(admin.refundPayment({ paymentId: p, reason: 'customer request', idempotencyKey: 'm4b' }, ACTOR));
            expect(code(err)).toMatchObject({ code: status.FAILED_PRECONDITION, message: 'PAYMENT_ALREADY_REFUNDED' });
        });

        it('replaying a refunded credits payment whose user has no wallet is already_applied (M4)', async () => {
            const u = await user(null);
            const p = await payment(u, { amount: 30 });
            await admin.refundPayment({ paymentId: p, reason: 'customer request', idempotencyKey: 'm4c' }, ACTOR);
            const again = await admin.refundPayment({ paymentId: p, reason: 'customer request', idempotencyKey: 'm4c' }, ACTOR);
            expect(again).toMatchObject({ alreadyApplied: true, walletAdjusted: false });
        });

        it('one refund key used for a DIFFERENT payment is IDEMPOTENCY_KEY_REUSED (M1/M4)', async () => {
            const u = await user(100);
            const p1 = await payment(u, { amount: 30 });
            const p2 = await payment(u, { amount: 30 });
            await admin.refundPayment({ paymentId: p1, reason: 'customer request', idempotencyKey: 'shared-refund' }, ACTOR);
            const err = await fail(admin.refundPayment({ paymentId: p2, reason: 'customer request', idempotencyKey: 'shared-refund' }, ACTOR));
            expect(code(err)).toMatchObject({ code: status.FAILED_PRECONDITION, message: 'IDEMPOTENCY_KEY_REUSED' });
            expect((await prisma.payment.findUniqueOrThrow({ where: { id: p2 } })).status).toBe(1);
            expect(await balanceOf(u)).toBe(70);
        });

        it('concurrent refunds of one payment apply once', async () => {
            const u = await user(100);
            const p = await payment(u, { amount: 30 });
            const rs = await Promise.all(
                Array.from({ length: 4 }, (_, i) =>
                    fail(admin.refundPayment({ paymentId: p, reason: 'customer request', idempotencyKey: `c${i}` }, ACTOR))
                )
            );
            expect(rs.filter((e) => e === null)).toHaveLength(1);
            expect(await balanceOf(u)).toBe(70);
        });

        it('unpaid -> FAILED_PRECONDITION PAYMENT_NOT_PAID, unknown -> NOT_FOUND', async () => {
            const u = await user(20);
            const p = await payment(u, { status: 0 });
            expect(code(await fail(admin.refundPayment({ paymentId: p, reason: 'customer request', idempotencyKey: 'u' }, ACTOR)))).toMatchObject({
                code: status.FAILED_PRECONDITION,
                message: 'PAYMENT_NOT_PAID',
            });
            expect(code(await fail(admin.refundPayment({ paymentId: 'missing', reason: 'customer request', idempotencyKey: 'm' }, ACTOR))).code).toBe(
                status.NOT_FOUND
            );
        });
    });

    describe('changeTier', () => {
        const outboxFor = (u: string) =>
            prisma.outboxEvent.findMany({
                where: { type: 'finance.subscription.changed', envelope: { path: ['data', 'userId'], equals: u } },
            });

        it('creates the subscription and publishes finance.subscription.changed in the same tx', async () => {
            const u = await user(null);
            const r = await admin.changeTier({ userId: u, tier: 2, billingCycle: '', reason: 'promo upgrade', idempotencyKey: 't1' }, ACTOR);
            expect(r).toMatchObject({ previousTier: 0, newTier: 2, newBillingCycle: 'monthly', isActive: true, previousBillingCycle: '' });
            const events = await outboxFor(u);
            expect(events).toHaveLength(1);
            expect((events[0].envelope as { data: Record<string, unknown> }).data).toMatchObject({ userId: u, fromTier: 0, toTier: 2 });
            expect(events[0].source).toBe('finance');
        });

        it('replaying the same tier (same key) publishes nothing more', async () => {
            const u = await user(null);
            await admin.changeTier({ userId: u, tier: 3, billingCycle: 'yearly', reason: 'vip for partner', idempotencyKey: 't2' }, ACTOR);
            const r = await admin.changeTier({ userId: u, tier: 3, billingCycle: 'yearly', reason: 'vip for partner', idempotencyKey: 't2' }, ACTOR);
            expect(r).toMatchObject({ previousTier: 3, newTier: 3, alreadyApplied: true });
            expect(await outboxFor(u)).toHaveLength(1);
        });

        it('a replay is a pure no-op: the row is not rewritten (updatedAt/updatedBy unchanged)', async () => {
            const u = await user(null);
            await admin.changeTier({ userId: u, tier: 2, billingCycle: 'monthly', reason: 'first apply', idempotencyKey: 't2b' }, ACTOR);
            const before = await prisma.userSubscription.findUniqueOrThrow({ where: { userId: u } });
            await new Promise((r) => setTimeout(r, 20));
            const r = await admin.changeTier({ userId: u, tier: 2, billingCycle: 'monthly', reason: 'first apply', idempotencyKey: 't2b' }, 'other-admin');
            const after = await prisma.userSubscription.findUniqueOrThrow({ where: { userId: u } });
            expect(r.alreadyApplied).toBe(true);
            expect(after.updatedAt).toEqual(before.updatedAt);
            expect(after.updatedBy).toBe(before.updatedBy);
        });

        it('re-saving the same tier on an expired (inactive) subscription reactivates it as a real change', async () => {
            const u = await user(null);
            await admin.changeTier({ userId: u, tier: 2, billingCycle: 'monthly', reason: 'first apply', idempotencyKey: 'x1' }, ACTOR);
            await prisma.userSubscription.update({ where: { userId: u }, data: { isActive: false } });
            const r = await admin.changeTier({ userId: u, tier: 2, billingCycle: 'monthly', reason: 'renew after expiry', idempotencyKey: 'x2' }, ACTOR);
            expect(r).toMatchObject({ alreadyApplied: false, isActive: true });
            expect((await prisma.userSubscription.findUniqueOrThrow({ where: { userId: u } })).isActive).toBe(true);
            // The event carries tier transitions only (publisher no-ops on from === to).
            expect(await outboxFor(u)).toHaveLength(1);
        });

        it('two concurrent first-time tier changes for one user never surface INTERNAL (L6)', async () => {
            const u = await user(null);
            const rs = await Promise.all(
                [1, 2].map((tier) =>
                    fail(admin.changeTier({ userId: u, tier, billingCycle: '', reason: 'racing admins', idempotencyKey: `race${tier}` }, ACTOR))
                )
            );
            expect(rs.filter((e) => e !== null)).toEqual([]);
            expect(await prisma.userSubscription.count({ where: { userId: u } })).toBe(1);
        });

        it('tier 0 deactivates; an unknown user is NOT_FOUND; an invalid tier is INVALID_ARGUMENT', async () => {
            const u = await user(null);
            await admin.changeTier({ userId: u, tier: 1, billingCycle: '', reason: 'start basic', idempotencyKey: 't3' }, ACTOR);
            const down = await admin.changeTier({ userId: u, tier: 0, billingCycle: '', reason: 'cancel basic', idempotencyKey: 't4' }, ACTOR);
            expect(down).toMatchObject({ previousTier: 1, newTier: 0, isActive: false });
            expect(code(await fail(admin.changeTier({ userId: 'ghost-user', tier: 1, billingCycle: '', reason: 'not a user', idempotencyKey: 't5' }, ACTOR))).code).toBe(
                status.NOT_FOUND
            );
            expect(code(await fail(admin.changeTier({ userId: u, tier: 9, billingCycle: '', reason: 'bad tier', idempotencyKey: 't6' }, ACTOR))).code).toBe(
                status.INVALID_ARGUMENT
            );
        });
    });

    describe('lists', () => {
        it('ListPayments pages by cursor and filters by user', async () => {
            const u = await user(1);
            for (let i = 0; i < 3; i++) await payment(u);
            const first = await admin.listPayments({ userId: u, cursor: '', limit: 2 });
            expect(first.payments).toHaveLength(2);
            expect(first.nextCursor).not.toBe('');
            const second = await admin.listPayments({ userId: u, cursor: first.nextCursor, limit: 2 });
            expect(second.payments).toHaveLength(1);
            expect(second.nextCursor).toBe('');
            const ids = [...first.payments, ...second.payments].map((p) => p.id);
            expect(new Set(ids).size).toBe(3);
        });

        it('ListSubscriptions returns a page with a cursor', async () => {
            const u = await user(null);
            await admin.changeTier({ userId: u, tier: 1, billingCycle: '', reason: 'for listing', idempotencyKey: 'l1' }, ACTOR);
            const page = await admin.listSubscriptions({ cursor: '', limit: 1 });
            expect(page.subscriptions).toHaveLength(1);
            expect(page.nextCursor).not.toBe('');
        });
    });
});
