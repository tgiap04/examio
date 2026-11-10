import { HttpException, Injectable, Logger } from '@nestjs/common';
import type { Metadata } from '@grpc/grpc-js';
import { assertWholeCredits } from '@examio/grpc';

import { AuditWriterService } from '../../common/audit-writer.service';
import { writeAuditBestEffort } from '../admin-roles/best-effort-audit';
import { AuthUsersClient } from '../../clients/auth-users.client';
import { FinanceClient } from '../../clients/finance.client';
import { CreditBody } from './dto/credit.body';
import { RefundBody } from './dto/refund.body';
import { SetTierBody } from './dto/set-tier.body';

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
    /** True when the Idempotency-Key was already applied (replay: no new effect, no new audit row). */
    alreadyApplied: boolean;
}

export interface CreditResult {
    userId: string;
    walletId: string;
    previousBalance: number;
    newBalance: number;
    amount: number;
    direction: 'ADD' | 'SUBTRACT';
    alreadyApplied: boolean;
}

export interface SetTierResult {
    userId: string;
    previousTier: number;
    newTier: number;
    previousBillingCycle: string | null;
    newBillingCycle: string;
    isActive: boolean;
    alreadyApplied: boolean;
}

/** Finance detail code -> the HTTP status/message the endpoints always returned. */
const LEGACY_ERRORS: Record<string, { status: number; message: string }> = {
    INSUFFICIENT_CREDITS: { status: 400, message: 'Insufficient balance for SUBTRACT adjustment' },
    PAYMENT_ALREADY_REFUNDED: { status: 409, message: 'Payment already refunded' },
    PAYMENT_NOT_PAID: { status: 409, message: 'Payment is not in paid status — cannot refund' },
    PAYMENT_NOT_FOUND: { status: 404, message: 'Payment not found' },
    WALLET_NOT_FOUND: { status: 404, message: 'Wallet not found for this user' },
    USER_NOT_FOUND: { status: 404, message: 'User not found' },
    IDEMPOTENCY_KEY_REUSED: {
        status: 409,
        message: 'Idempotency-Key was already used for a different request',
    },
};

/**
 * AdminFinanceService: high-risk admin financial actions. The money and tier
 * writes are owned by finance (FinanceAdminService, one tx + outbox there);
 * this class forwards the admin's own token, keeps the response shapes and
 * HTTP errors stable, and records the AdminAudit row (admin-owned) once the
 * write is committed. A replayed idempotency key is not audited twice.
 */
@Injectable()
export class AdminFinanceService {
    private readonly logger = new Logger(AdminFinanceService.name);

    constructor(
        private readonly finance: FinanceClient,
        private readonly auditWriter: AuditWriterService,
        private readonly authUsers: AuthUsersClient
    ) {}

    async refund(
        body: RefundBody,
        ctx: AuditContext,
        metadata: Metadata,
        idempotencyKey: string
    ): Promise<RefundResult> {
        const res = await this.run(() =>
            this.finance.refundPayment(
                { paymentId: body.paymentId, reason: body.reason, idempotencyKey },
                metadata
            )
        );
        const result: RefundResult = {
            paymentId: res.paymentId,
            userId: res.userId,
            amount: res.amount,
            previousStatus: res.previousStatus,
            newStatus: res.newStatus,
            walletAdjusted: res.walletAdjusted,
            alreadyApplied: res.alreadyApplied,
        };
        if (!res.alreadyApplied) {
            await this.audit(ctx, 'admin.finance.refund', result.userId, body.reason, {
                paymentId: result.paymentId,
                userId: result.userId,
                amount: result.amount,
                previousStatus: result.previousStatus,
                newStatus: result.newStatus,
                walletAdjusted: result.walletAdjusted,
                reason: body.reason,
            });
        }
        return result;
    }

    /** Admin wallet adjustment: ADD or SUBTRACT whole credits (never below zero). */
    async credit(
        body: CreditBody,
        ctx: AuditContext,
        metadata: Metadata,
        idempotencyKey: string
    ): Promise<CreditResult> {
        assertWholeCredits(body.amount);
        const res = await this.run(() =>
            this.finance.adjustBalance(
                {
                    userId: body.userId,
                    amount: body.amount,
                    direction: body.direction,
                    reason: body.reason,
                    idempotencyKey,
                },
                metadata
            )
        );
        const result: CreditResult = {
            userId: res.userId,
            walletId: res.walletId,
            previousBalance: res.previousBalance,
            newBalance: res.newBalance,
            amount: res.amount,
            direction: res.direction as 'ADD' | 'SUBTRACT',
            alreadyApplied: res.alreadyApplied,
        };
        if (!res.alreadyApplied) {
            const { alreadyApplied: _applied, ...effect } = result;
            await this.audit(ctx, 'admin.finance.credit', body.userId, body.reason, {
                ...effect,
                reason: body.reason,
            });
        }
        return result;
    }

    /** Force-set the subscription tier; `isActive` is `tier > 0`. */
    async setTier(
        body: SetTierBody,
        ctx: AuditContext,
        metadata: Metadata,
        idempotencyKey: string
    ): Promise<SetTierResult> {
        // Finance keeps no FK to the user (database per service), so it cannot tell
        // an unknown id from a real one: ask auth first, with the admin's own token.
        await this.assertUserExists(body.userId, metadata);
        const res = await this.run(() =>
            this.finance.changeTier(
                {
                    userId: body.userId,
                    tier: body.tier,
                    billingCycle: body.billingCycle ?? '',
                    reason: body.reason,
                    idempotencyKey,
                },
                metadata
            )
        );
        const result: SetTierResult = {
            userId: res.userId,
            previousTier: res.previousTier,
            newTier: res.newTier,
            previousBillingCycle: res.previousBillingCycle || null,
            newBillingCycle: res.newBillingCycle,
            isActive: res.isActive,
            alreadyApplied: res.alreadyApplied,
        };
        if (!res.alreadyApplied) {
            await this.audit(ctx, 'admin.finance.tier_change', body.userId, body.reason, {
                userId: body.userId,
                from: { tier: result.previousTier, billingCycle: result.previousBillingCycle },
                to: { tier: result.newTier, billingCycle: result.newBillingCycle },
                isActive: result.isActive,
                reason: body.reason,
            });
        }
        return result;
    }

    private async assertUserExists(userId: string, metadata: Metadata): Promise<void> {
        try {
            await this.authUsers.getUserAdminDetail(userId, metadata);
        } catch (err) {
            if (err instanceof HttpException && err.getStatus() === 404) {
                const { status, message } = LEGACY_ERRORS.USER_NOT_FOUND;
                throw new HttpException({ statusCode: status, code: 'USER_NOT_FOUND', message }, status);
            }
            throw err;
        }
    }

    private async run<T>(call: () => Promise<T>): Promise<T> {
        try {
            return await call();
        } catch (err) {
            const legacy =
                err instanceof HttpException
                    ? LEGACY_ERRORS[(err.getResponse() as { code?: string }).code ?? '']
                    : undefined;
            if (!legacy) throw err;
            const { code } = err.getResponse() as { code: string };
            throw new HttpException(
                { statusCode: legacy.status, code, message: legacy.message },
                legacy.status
            );
        }
    }

    /** The finance write is committed: an audit failure is logged, never surfaced (a retry must not re-apply). */
    private audit(
        ctx: AuditContext,
        action: string,
        targetId: string,
        reason: string,
        payload: Record<string, unknown>
    ): Promise<void> {
        return writeAuditBestEffort(this.auditWriter, this.logger, {
            adminId: ctx.adminId,
            action,
            targetId,
            payload,
            reason,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
        });
    }
}
