import { Injectable } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { Prisma } from '../../prisma';
import { GenerateIdService, invalidateWalletCachesBestEffort } from '@examio/common';
import { PrismaService } from '../../prisma';
import { RedisService } from '@examio/redis';
import { financeAdminV1 } from '@examio/contracts';
import {
    assertIdempotencyKey,
    rpcError,
    WalletMoneyService,
} from '../wallet/wallet-money.service';
import { SubscriptionChangedPublisher } from '../sepay/subscription-changed.publisher';
import { afterCursor, clampLimit, decodeCursor, encodeCursor } from './cursor';

/** Payment.status values (see payment.prisma). */
const PAYMENT_PAID = 1;
const PAYMENT_REFUNDED = 4;
const PAYMENT_TYPE_CREDITS = 'credits';
const TYPE_REFUND = 2;

const TIERS = new Set([0, 1, 2, 3]);
const CYCLES = new Set(['monthly', 'yearly']);

/**
 * Privileged finance writes. The actor is the forwarded admin token subject
 * (passed in by the controller); no request carries an actor. Every write is
 * idempotent on its key and runs in ONE transaction.
 */
@Injectable()
export class FinanceAdminService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly ids: GenerateIdService,
        private readonly redis: RedisService,
        private readonly money: WalletMoneyService,
        private readonly changed: SubscriptionChangedPublisher
    ) {}

    async adjustBalance(
        req: financeAdminV1.AdjustBalanceRequest,
        actor: string
    ): Promise<financeAdminV1.AdjustBalanceResponse> {
        if (req.direction !== 'ADD' && req.direction !== 'SUBTRACT') {
            throw rpcError(status.INVALID_ARGUMENT, 'INVALID_DIRECTION');
        }
        const { transaction, alreadyApplied } = await this.money.adjust(
            {
                userId: req.userId,
                amount: req.amount,
                direction: req.direction,
                reason: req.reason,
                idempotencyKey: req.idempotencyKey,
            },
            actor
        );
        const newBalance = transaction.balanceAfter ?? 0;
        return {
            userId: req.userId,
            walletId: transaction.walletId,
            previousBalance:
                req.direction === 'ADD' ? newBalance - req.amount : newBalance + req.amount,
            newBalance,
            amount: req.amount,
            direction: req.direction,
            alreadyApplied,
        };
    }

    async refundPayment(
        req: financeAdminV1.RefundPaymentRequest,
        actor: string
    ): Promise<financeAdminV1.RefundPaymentResponse> {
        assertIdempotencyKey(req.idempotencyKey);
        if (!req.paymentId) throw rpcError(status.INVALID_ARGUMENT, 'PAYMENT_ID_REQUIRED');
        const key = `refund-payment:${req.idempotencyKey}`;

        const out = await this.refundTx(req, actor, key).catch((err) => {
            // The key already refunded another payment: a different request, not a replay.
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
                throw rpcError(status.FAILED_PRECONDITION, 'IDEMPOTENCY_KEY_REUSED');
            }
            throw err;
        });

        if (out.walletId && !out.alreadyApplied) {
            await invalidateWalletCachesBestEffort(this.redis, out.userId, out.walletId);
        }
        const { walletId: _walletId, ...response } = out;
        return response;
    }

    private async refundTx(
        req: financeAdminV1.RefundPaymentRequest,
        actor: string,
        key: string
    ) {
        return this.prisma.$transaction(async (tx) => {
            const payment = await tx.payment.findUnique({ where: { id: req.paymentId } });
            if (!payment) throw rpcError(status.NOT_FOUND, 'PAYMENT_NOT_FOUND');
            const result = {
                paymentId: payment.id,
                userId: payment.userId,
                amount: payment.amount,
                previousStatus: PAYMENT_PAID,
                newStatus: PAYMENT_REFUNDED,
                alreadyApplied: false,
            };

            // Atomic claim: only one caller flips PAID -> REFUNDED.
            const claimed = await tx.payment.updateMany({
                where: { id: payment.id, status: PAYMENT_PAID },
                data: { status: PAYMENT_REFUNDED, updatedBy: actor, refundIdempotencyKey: key },
            });
            if (claimed.count === 0) {
                // Re-read: a concurrent same-key refund may have committed after our first read.
                const current = await tx.payment.findUnique({ where: { id: payment.id } });
                if (current?.status === PAYMENT_REFUNDED) {
                    const replay = await tx.walletTransaction.findFirst({
                        where: { idempotencyKey: key, wallet: { userId: payment.userId } },
                    });
                    // The key is stored on the payment, so a refund that moved no
                    // credits (subscription / no wallet) replays too.
                    if (current.refundIdempotencyKey === key || (!current.refundIdempotencyKey && replay)) {
                        return {
                            ...result,
                            walletAdjusted: !!replay,
                            walletId: replay?.walletId,
                            alreadyApplied: true,
                        };
                    }
                    throw rpcError(status.FAILED_PRECONDITION, 'PAYMENT_ALREADY_REFUNDED');
                }
                throw rpcError(status.FAILED_PRECONDITION, 'PAYMENT_NOT_PAID');
            }

            if (payment.paymentType !== PAYMENT_TYPE_CREDITS) {
                return { ...result, walletAdjusted: false, walletId: undefined };
            }
            const wallet = await tx.wallet.findUnique({ where: { userId: payment.userId } });
            if (!wallet) return { ...result, walletAdjusted: false, walletId: undefined };

            // Clamp at zero: a refund never drives the balance negative.
            const updated = await tx.$queryRaw<Array<{ balance: number }>>`
                UPDATE "Wallet"
                SET balance = balance - LEAST(${payment.amount}, balance), "updatedAt" = now(), "updatedBy" = ${actor}
                WHERE id = ${wallet.id}
                RETURNING balance`;
            await tx.walletTransaction.create({
                data: {
                    id: this.ids.generateId(),
                    walletId: wallet.id,
                    amount: payment.amount,
                    type: TYPE_REFUND,
                    direction: 'SUBTRACT',
                    description: `Admin refund: ${req.reason}`,
                    idempotencyKey: key,
                    balanceAfter: updated[0].balance,
                    createdBy: actor,
                    updatedBy: actor,
                },
            });
            return { ...result, walletAdjusted: true, walletId: wallet.id };
        });
    }

    async changeTier(
        req: financeAdminV1.ChangeTierRequest,
        actor: string
    ): Promise<financeAdminV1.ChangeTierResponse> {
        assertIdempotencyKey(req.idempotencyKey);
        if (!req.userId) throw rpcError(status.INVALID_ARGUMENT, 'USER_ID_REQUIRED');
        if (!TIERS.has(req.tier)) throw rpcError(status.INVALID_ARGUMENT, 'INVALID_TIER');
        if (req.billingCycle && !CYCLES.has(req.billingCycle)) {
            throw rpcError(status.INVALID_ARGUMENT, 'INVALID_BILLING_CYCLE');
        }
        const isActive = req.tier > 0;

        // finance cannot tell an unknown user from a known one (no `User` table, no FK):
        // the admin-only caller is audited and `userId` comes from auth's own user list.
        return this.applyTier(req, actor, isActive);
    }

    /**
     * Two first-time writers race on the `userId` unique index: the loser gets
     * P2002 and retries once, now seeing the winner's row (update path).
     */
    private async applyTier(
        req: financeAdminV1.ChangeTierRequest,
        actor: string,
        isActive: boolean
    ): Promise<financeAdminV1.ChangeTierResponse> {
        for (let attempt = 0; ; attempt++) {
            try {
                return await this.tierTx(req, actor, isActive);
            } catch (err) {
                const raced =
                    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
                if (!raced || attempt >= 1) throw err;
            }
        }
    }

    private tierTx(
        req: financeAdminV1.ChangeTierRequest,
        actor: string,
        isActive: boolean
    ): Promise<financeAdminV1.ChangeTierResponse> {
        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.userSubscription.findUnique({ where: { userId: req.userId } });
            const previousTier = existing?.tier ?? 0;
            const newBillingCycle = req.billingCycle || existing?.billingCycle || 'monthly';
            // Setting a tier is a state write: same tier + cycle (a replay, or an admin
            // re-saving an active row) changes nothing, so write nothing and publish nothing.
            if (
                existing &&
                existing.tier === req.tier &&
                existing.billingCycle === newBillingCycle &&
                existing.isActive === isActive
            ) {
                return {
                    userId: req.userId,
                    previousTier,
                    newTier: req.tier,
                    previousBillingCycle: existing.billingCycle,
                    newBillingCycle,
                    isActive: existing.isActive,
                    alreadyApplied: true,
                };
            }
            const saved = existing
                ? await tx.userSubscription.update({
                      where: { userId: req.userId },
                      data: { tier: req.tier, billingCycle: newBillingCycle, isActive, updatedBy: actor },
                  })
                : await tx.userSubscription.create({
                      data: {
                          id: this.ids.generateId(),
                          userId: req.userId,
                          tier: req.tier,
                          billingCycle: newBillingCycle,
                          isActive,
                          createdBy: actor,
                          updatedBy: actor,
                      },
                  });
            await this.changed.publish(tx, {
                userId: req.userId,
                fromTier: previousTier,
                toTier: req.tier,
                updatedAt: saved.updatedAt,
            });
            return {
                userId: req.userId,
                previousTier,
                newTier: req.tier,
                previousBillingCycle: existing?.billingCycle ?? '',
                newBillingCycle,
                isActive,
                alreadyApplied: false,
            };
        });
    }

    async listPayments(
        req: financeAdminV1.ListPaymentsRequest
    ): Promise<financeAdminV1.ListPaymentsResponse> {
        const limit = clampLimit(req.limit);
        const rows = await this.prisma.payment.findMany({
            where: {
                ...(req.userId ? { userId: req.userId } : {}),
                ...(req.status !== undefined ? { status: req.status } : {}),
                ...afterCursor(decodeCursor(req.cursor)),
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: limit + 1,
        });
        const page = rows.slice(0, limit);
        return {
            payments: page.map((p) => ({
                id: p.id,
                userId: p.userId,
                amount: p.amount,
                currency: p.currency,
                status: p.status,
                paymentType: p.paymentType,
                createdAt: String(p.createdAt.getTime()),
            })),
            nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : '',
        };
    }

    async listSubscriptions(
        req: financeAdminV1.ListSubscriptionsRequest
    ): Promise<financeAdminV1.ListSubscriptionsResponse> {
        const limit = clampLimit(req.limit);
        const rows = await this.prisma.userSubscription.findMany({
            where: afterCursor(decodeCursor(req.cursor)),
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: limit + 1,
        });
        const page = rows.slice(0, limit);
        return {
            subscriptions: page.map((s) => ({
                id: s.id,
                userId: s.userId,
                tier: s.tier,
                billingCycle: s.billingCycle,
                isActive: s.isActive,
                updatedAt: String(s.updatedAt.getTime()),
            })),
            nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : '',
        };
    }
}
