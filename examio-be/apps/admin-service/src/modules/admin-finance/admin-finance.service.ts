import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GenerateIdService } from '@examio/common';
import { PrismaService } from '@examio/database';

import { AuditWriterService } from '../../common/audit-writer.service';
import { CreditBody } from './dto/credit.body';
import { RefundBody } from './dto/refund.body';
import { SetTierBody } from './dto/set-tier.body';

/** Payment.status values — see schema.prisma. */
const PAYMENT_STATUS = {
    UNPAID: 0,
    PAID: 1,
    OVERDUE: 2,
    CANCELLED: 3,
    REFUNDED: 4,
} as const;

/** WalletTransaction.type values — see schema.prisma. */
const WALLET_TX_TYPE = {
    BUY_CREDITS: 0,
    BUY_SUBSCRIPTION: 1,
    REFUND: 2,
    ADMIN_ADJUSTMENT: 3,
    USE_SERVICES: 4,
} as const;

const WALLET_DIRECTION = {
    ADD: 'ADD',
    SUBTRACT: 'SUBTRACT',
} as const;

const PAYMENT_TYPE_CREDITS = 'credits';

export interface AuditContext {
    adminId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
}

export interface RefundResult {
    paymentId: string;
    userId: string;
    amount: number;
    previousStatus: number;
    newStatus: number;
    walletAdjusted: boolean;
}

export interface CreditResult {
    userId: string;
    walletId: string;
    previousBalance: number;
    newBalance: number;
    amount: number;
    direction: 'ADD' | 'SUBTRACT';
}

export interface SetTierResult {
    userId: string;
    previousTier: number;
    newTier: number;
    previousBillingCycle: string | null;
    newBillingCycle: string;
    isActive: boolean;
}

/**
 * AdminFinanceService — high-risk admin financial actions.
 *
 * Every mutation:
 *  - runs inside prisma.$transaction with isolationLevel = 'Serializable'
 *  - writes the AdminAudit row inside the same transaction so audit +
 *    mutation either both commit or both roll back
 *  - re-validates the target row inside the tx to defeat concurrent admins
 */
@Injectable()
export class AdminFinanceService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auditWriter: AuditWriterService,
        private readonly generateId: GenerateIdService
    ) {}

    /**
     * Refund a paid payment. Reverses the wallet credit if and only if
     * the payment was for credits (subscription payments do not touch
     * the wallet).
     */
    async refund(
        body: RefundBody,
        ctx: AuditContext
    ): Promise<RefundResult> {
        return this.prisma.$transaction(
            async (tx) => {
                const payment = await tx.payment.findUnique({
                    where: { id: body.paymentId },
                });

                if (!payment) {
                    throw new NotFoundException('Payment not found');
                }

                if (payment.status === PAYMENT_STATUS.REFUNDED) {
                    throw new ConflictException('Payment already refunded');
                }

                if (payment.status !== PAYMENT_STATUS.PAID) {
                    throw new ConflictException(
                        'Payment is not in paid status — cannot refund'
                    );
                }

                const previousStatus = payment.status;

                await tx.payment.update({
                    where: { id: payment.id },
                    data: { status: PAYMENT_STATUS.REFUNDED },
                });

                let walletAdjusted = false;

                if (payment.paymentType === PAYMENT_TYPE_CREDITS) {
                    const wallet = await tx.wallet.findUnique({
                        where: { userId: payment.userId },
                    });

                    if (wallet) {
                        // Clamp wallet >= 0 so refund never drives the
                        // balance negative even if the user spent the credits.
                        const decrement = Math.min(payment.amount, wallet.balance);

                        await tx.wallet.update({
                            where: { id: wallet.id },
                            data: {
                                balance: { decrement },
                            },
                        });

                        await tx.walletTransaction.create({
                            data: {
                                id: this.generateId.generateId(),
                                walletId: wallet.id,
                                amount: payment.amount,
                                type: WALLET_TX_TYPE.REFUND,
                                direction: WALLET_DIRECTION.SUBTRACT,
                                description: `Admin refund: ${body.reason}`,
                                createdBy: ctx.adminId,
                                updatedBy: ctx.adminId,
                            },
                        });

                        walletAdjusted = true;
                    }
                }

                await this.auditWriter.write(
                    {
                        adminId: ctx.adminId,
                        action: 'admin.finance.refund',
                        targetId: payment.userId,
                        payload: {
                            paymentId: payment.id,
                            userId: payment.userId,
                            amount: payment.amount,
                            paymentType: payment.paymentType,
                            previousStatus,
                            newStatus: PAYMENT_STATUS.REFUNDED,
                            walletAdjusted,
                            reason: body.reason,
                        },
                        reason: body.reason,
                        ipAddress: ctx.ipAddress,
                        userAgent: ctx.userAgent,
                    },
                    { tx }
                );

                return {
                    paymentId: payment.id,
                    userId: payment.userId,
                    amount: payment.amount,
                    previousStatus,
                    newStatus: PAYMENT_STATUS.REFUNDED,
                    walletAdjusted,
                };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
    }

    /**
     * Admin wallet adjustment — ADD credits or SUBTRACT credits.
     * SUBTRACT cannot drive balance negative (400 Bad Request).
     */
    async credit(
        body: CreditBody,
        ctx: AuditContext
    ): Promise<CreditResult> {
        return this.prisma.$transaction(
            async (tx) => {
                const user = await tx.user.findUnique({
                    where: { id: body.userId },
                    select: { id: true },
                });

                if (!user) {
                    throw new NotFoundException('User not found');
                }

                const wallet = await tx.wallet.findUnique({
                    where: { userId: body.userId },
                });

                if (!wallet) {
                    throw new NotFoundException(
                        'Wallet not found for this user'
                    );
                }

                if (
                    body.direction === WALLET_DIRECTION.SUBTRACT &&
                    wallet.balance < body.amount
                ) {
                    throw new BadRequestException(
                        'Insufficient balance for SUBTRACT adjustment'
                    );
                }

                const previousBalance = wallet.balance;
                const delta =
                    body.direction === WALLET_DIRECTION.ADD
                        ? body.amount
                        : -body.amount;
                const newBalance = previousBalance + delta;

                await tx.wallet.update({
                    where: { id: wallet.id },
                    data: { balance: newBalance },
                });

                await tx.walletTransaction.create({
                    data: {
                        id: this.generateId.generateId(),
                        walletId: wallet.id,
                        amount: body.amount,
                        type: WALLET_TX_TYPE.ADMIN_ADJUSTMENT,
                        direction: body.direction,
                        description: `Admin adjustment: ${body.reason}`,
                        createdBy: ctx.adminId,
                        updatedBy: ctx.adminId,
                    },
                });

                await this.auditWriter.write(
                    {
                        adminId: ctx.adminId,
                        action: 'admin.finance.credit',
                        targetId: body.userId,
                        payload: {
                            userId: body.userId,
                            walletId: wallet.id,
                            previousBalance,
                            newBalance,
                            amount: body.amount,
                            direction: body.direction,
                            reason: body.reason,
                        },
                        reason: body.reason,
                        ipAddress: ctx.ipAddress,
                        userAgent: ctx.userAgent,
                    },
                    { tx }
                );

                return {
                    userId: body.userId,
                    walletId: wallet.id,
                    previousBalance,
                    newBalance,
                    amount: body.amount,
                    direction: body.direction,
                };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
    }

    /**
     * Force-set subscription tier for a user. Upserts UserSubscription
     * if missing. isActive is set to `tier > 0`.
     */
    async setTier(
        body: SetTierBody,
        ctx: AuditContext
    ): Promise<SetTierResult> {
        return this.prisma.$transaction(
            async (tx) => {
                const user = await tx.user.findUnique({
                    where: { id: body.userId },
                    select: { id: true },
                });

                if (!user) {
                    throw new NotFoundException('User not found');
                }

                const existing = await tx.userSubscription.findUnique({
                    where: { userId: body.userId },
                });

                const previousTier = existing?.tier ?? 0;
                const previousBillingCycle = existing?.billingCycle ?? null;
                const newBillingCycle =
                    body.billingCycle ??
                    existing?.billingCycle ??
                    'monthly';
                const isActive = body.tier > 0;

                if (existing) {
                    await tx.userSubscription.update({
                        where: { userId: body.userId },
                        data: {
                            tier: body.tier,
                            billingCycle: newBillingCycle,
                            isActive,
                            updatedBy: ctx.adminId,
                        },
                    });
                } else {
                    await tx.userSubscription.create({
                        data: {
                            id: this.generateId.generateId(),
                            userId: body.userId,
                            tier: body.tier,
                            billingCycle: newBillingCycle,
                            isActive,
                            createdBy: ctx.adminId,
                            updatedBy: ctx.adminId,
                        },
                    });
                }

                await this.auditWriter.write(
                    {
                        adminId: ctx.adminId,
                        action: 'admin.finance.tier_change',
                        targetId: body.userId,
                        payload: {
                            userId: body.userId,
                            from: {
                                tier: previousTier,
                                billingCycle: previousBillingCycle,
                            },
                            to: {
                                tier: body.tier,
                                billingCycle: newBillingCycle,
                            },
                            isActive,
                            reason: body.reason,
                        },
                        reason: body.reason,
                        ipAddress: ctx.ipAddress,
                        userAgent: ctx.userAgent,
                    },
                    { tx }
                );

                return {
                    userId: body.userId,
                    previousTier,
                    newTier: body.tier,
                    previousBillingCycle,
                    newBillingCycle,
                    isActive,
                };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
    }
}
