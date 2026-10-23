import { randomUUID } from 'crypto';
import { status } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { GenerateIdService } from '@examio/common';
import { PrismaModule, PrismaService } from '../src/prisma';
import { RedisModule } from '@examio/redis';
import { EnsureWalletService } from '../src/modules/wallet/ensure-wallet.service';
import { WalletMoneyService } from '../src/modules/wallet/wallet-money.service';

/**
 * Money RPC core against a REAL Postgres: idempotent Debit/Credit/Refund,
 * including two parallel calls with the same key (ARCH section 12 money rule).
 */
describe('WalletMoneyService (e2e, real Postgres)', () => {
    let prisma: PrismaService;
    let money: WalletMoneyService;
    const users: string[] = [];

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [PrismaModule, RedisModule],
            providers: [GenerateIdService, EnsureWalletService, WalletMoneyService],
        }).compile();
        await moduleRef.init();
        prisma = moduleRef.get(PrismaService);
        money = moduleRef.get(WalletMoneyService);
    });

    afterAll(async () => {
        await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: { in: users } } } });
        await prisma.userSubscription.deleteMany({ where: { userId: { in: users } } });
        await prisma.wallet.deleteMany({ where: { userId: { in: users } } });
        await prisma.$disconnect();
    });

    async function user(balance: number | null, role: 'TEACHER' | 'STUDENT' = 'TEACHER') {
        const id = `mn_${randomUUID().replace(/-/g, '').slice(0, 18)}`;
        users.push(id);
        if (balance !== null) {
            await prisma.wallet.create({ data: { id: `w_${id}`, userId: id, balance } });
        }
        return id;
    }
    const balanceOf = async (userId: string) =>
        (await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance;
    const txCount = (userId: string, key: string) =>
        prisma.walletTransaction.count({
            where: { wallet: { userId }, idempotencyKey: key },
        });
    const fail = async (p: Promise<unknown>) => p.then(() => null, (e) => e);

    describe('Debit', () => {
        it('applies once and records balanceAfter', async () => {
            const u = await user(20);
            const r = await money.debit({ userId: u, amount: 5, reason: 'quick upload', idempotencyKey: 'k1' });
            expect(r.alreadyApplied).toBe(false);
            expect(r.transaction).toMatchObject({ amount: 5, direction: 'SUBTRACT', idempotencyKey: 'debit:k1', balanceAfter: 15 });
            expect(await balanceOf(u)).toBe(15);
        });

        it('the same key twice -> one tx, balance changed once, second already_applied', async () => {
            const u = await user(20);
            const a = await money.debit({ userId: u, amount: 5, reason: 'r', idempotencyKey: 'dup' });
            const b = await money.debit({ userId: u, amount: 5, reason: 'r', idempotencyKey: 'dup' });
            expect([a.alreadyApplied, b.alreadyApplied]).toEqual([false, true]);
            expect(b.transaction.id).toBe(a.transaction.id);
            expect(b.transaction.balanceAfter).toBe(15);
            expect(await txCount(u, 'debit:dup')).toBe(1);
            expect(await balanceOf(u)).toBe(15);
        });

        it('two PARALLEL calls with the same key -> exactly one applied', async () => {
            const u = await user(20);
            const results = await Promise.all(
                Array.from({ length: 6 }, () =>
                    money.debit({ userId: u, amount: 7, reason: 'r', idempotencyKey: 'race' })
                )
            );
            expect(results.filter((r) => !r.alreadyApplied)).toHaveLength(1);
            expect(new Set(results.map((r) => r.transaction.id)).size).toBe(1);
            expect(await txCount(u, 'debit:race')).toBe(1);
            expect(await balanceOf(u)).toBe(13);
        });

        it('parallel DISTINCT keys never overdraw', async () => {
            const u = await user(10);
            const results = await Promise.all(
                Array.from({ length: 5 }, (_, i) =>
                    fail(money.debit({ userId: u, amount: 4, reason: 'r', idempotencyKey: `d${i}` }))
                )
            );
            expect(results.filter((e) => e === null)).toHaveLength(2);
            expect(await balanceOf(u)).toBe(2);
        });

        it('insufficient balance -> FAILED_PRECONDITION INSUFFICIENT_CREDITS and NO tx row', async () => {
            const u = await user(3);
            const err = await fail(money.debit({ userId: u, amount: 5, reason: 'r', idempotencyKey: 'poor' }));
            expect(err.getError()).toMatchObject({ code: status.FAILED_PRECONDITION, message: 'INSUFFICIENT_CREDITS' });
            expect(await txCount(u, 'debit:poor')).toBe(0);
            expect(await balanceOf(u)).toBe(3);
        });

        it.each([0, -1, 1.5, NaN, 2_147_483_648])('rejects amount %p as INVALID_ARGUMENT', async (amount) => {
            const u = await user(20);
            const err = await fail(money.debit({ userId: u, amount, reason: 'r', idempotencyKey: 'bad' }));
            expect(err.getError()).toMatchObject({ code: status.INVALID_ARGUMENT });
        });

        it('rejects a missing idempotency key', async () => {
            const u = await user(20);
            const err = await fail(money.debit({ userId: u, amount: 1, reason: 'r', idempotencyKey: '' }));
            expect(err.getError()).toMatchObject({ code: status.INVALID_ARGUMENT });
        });

        it('a TEACHER without a wallet gets one (20 welcome, key welcome:<id>) and is then debited', async () => {
            const u = await user(null);
            const r = await money.debit(
                { userId: u, amount: 5, reason: 'r', idempotencyKey: 'first' },
                { createWallet: true }
            );
            expect(r.transaction.balanceAfter).toBe(15);
            expect(await balanceOf(u)).toBe(15);
            expect(await txCount(u, `welcome:${u}`)).toBe(1);
        });
    });

    describe('Debit on a missing wallet (L1)', () => {
        it('does not mint a welcome wallet unless the caller opts in (service callers / STUDENT)', async () => {
            const u = await user(null, 'STUDENT');
            const err = await fail(money.debit({ userId: u, amount: 5, reason: 'r', idempotencyKey: 'nw' }));
            expect(err.getError()).toMatchObject({ code: status.FAILED_PRECONDITION, message: 'WALLET_NOT_FOUND' });
            expect(await prisma.wallet.count({ where: { userId: u } })).toBe(0);
        });
    });

    describe('Idempotency key reuse (M1)', () => {
        it('Debit(K) and Credit(K) live in separate namespaces: both apply', async () => {
            const u = await user(20);
            const d = await money.debit({ userId: u, amount: 5, reason: 'r', idempotencyKey: 'shared' });
            const c = await money.credit({ userId: u, amount: 3, reason: 'r', idempotencyKey: 'shared' });
            expect([d.alreadyApplied, c.alreadyApplied]).toEqual([false, false]);
            expect(await balanceOf(u)).toBe(18);
            expect(await txCount(u, 'debit:shared')).toBe(1);
            expect(await txCount(u, 'credit:shared')).toBe(1);
        });

        it('replaying a Debit key with a different amount is IDEMPOTENCY_KEY_REUSED and moves nothing', async () => {
            const u = await user(20);
            await money.debit({ userId: u, amount: 5, reason: 'r', idempotencyKey: 'amt' });
            const err = await fail(money.debit({ userId: u, amount: 9, reason: 'r', idempotencyKey: 'amt' }));
            expect(err.getError()).toMatchObject({ code: status.FAILED_PRECONDITION, message: 'IDEMPOTENCY_KEY_REUSED' });
            expect(await balanceOf(u)).toBe(15);
        });

        it('an admin adjust replayed with the opposite direction is IDEMPOTENCY_KEY_REUSED', async () => {
            const u = await user(20);
            await money.adjust({ userId: u, amount: 4, direction: 'ADD', reason: 'x', idempotencyKey: 'adm' }, 'admin-1');
            const err = await fail(
                money.adjust({ userId: u, amount: 4, direction: 'SUBTRACT', reason: 'x', idempotencyKey: 'adm' }, 'admin-1')
            );
            expect(err.getError()).toMatchObject({ code: status.FAILED_PRECONDITION, message: 'IDEMPOTENCY_KEY_REUSED' });
            expect(await balanceOf(u)).toBe(24);
        });

        it('the same adjust replayed identically is still already_applied', async () => {
            const u = await user(20);
            const req = { userId: u, amount: 4, direction: 'ADD' as const, reason: 'x', idempotencyKey: 'adm2' };
            await money.adjust(req, 'admin-1');
            const again = await money.adjust(req, 'admin-1');
            expect(again.alreadyApplied).toBe(true);
            expect(await balanceOf(u)).toBe(24);
        });
    });

    describe('Credit', () => {
        it('applies once per key', async () => {
            const u = await user(5);
            const a = await money.credit({ userId: u, amount: 10, reason: 'r', idempotencyKey: 'c1' });
            const b = await money.credit({ userId: u, amount: 10, reason: 'r', idempotencyKey: 'c1' });
            expect([a.alreadyApplied, b.alreadyApplied]).toEqual([false, true]);
            expect(a.transaction).toMatchObject({ direction: 'ADD', balanceAfter: 15 });
            expect(await balanceOf(u)).toBe(15);
        });

        it('an unknown wallet is NOT_FOUND', async () => {
            const u = await user(null);
            const err = await fail(money.credit({ userId: u, amount: 1, reason: 'r', idempotencyKey: 'c2' }));
            expect(err.getError()).toMatchObject({ code: status.NOT_FOUND });
        });
    });

    describe('Refund', () => {
        it('reverses a debit once; the second refund is already_applied', async () => {
            const u = await user(20);
            await money.debit({ userId: u, amount: 8, reason: 'r', idempotencyKey: 'gen:1' });
            const a = await money.refund({ userId: u, debitIdempotencyKey: 'gen:1', reason: 'failed' });
            const b = await money.refund({ userId: u, debitIdempotencyKey: 'gen:1', reason: 'failed' });
            expect([a.alreadyApplied, b.alreadyApplied]).toEqual([false, true]);
            expect(a.transaction).toMatchObject({ amount: 8, direction: 'ADD' });
            expect(await balanceOf(u)).toBe(20);
        });

        it('parallel refunds credit once', async () => {
            const u = await user(20);
            await money.debit({ userId: u, amount: 8, reason: 'r', idempotencyKey: 'gen:2' });
            const rs = await Promise.all(
                Array.from({ length: 4 }, () => money.refund({ userId: u, debitIdempotencyKey: 'gen:2', reason: 'x' }))
            );
            expect(rs.filter((r) => !r.alreadyApplied)).toHaveLength(1);
            expect(await balanceOf(u)).toBe(20);
        });

        it('an unknown debit key is NOT_FOUND', async () => {
            const u = await user(20);
            const err = await fail(money.refund({ userId: u, debitIdempotencyKey: 'nope', reason: 'x' }));
            expect(err.getError()).toMatchObject({ code: status.NOT_FOUND });
        });
    });
});
