import { HttpException, Injectable, Logger } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { buildMetadata, FinanceClient } from '@examio/grpc';
import { FREE_TIER_FILES_PER_MONTH } from '../config/document.constants';
import { DocumentErrorCode, documentError } from '../modules/upload/document-errors';

/**
 * The debit did not (or may not have) happen. `definitive` = finance answered "no" (insufficient
 * credits, no wallet): nothing to undo. Otherwise the outcome is unknown (timeout, outage) and the
 * caller must try a compensating refund before giving up on the row.
 */
export class ChargeFailedError extends Error {
    constructor(
        readonly definitive: boolean,
        readonly httpError: HttpException
    ) {
        super(httpError.message);
    }
}

export interface DebitOutcome {
    /** Balance after the debit; undefined when AI_FREE_MODE skipped the charge. */
    newBalance?: number;
}

const walletMissing = (error: { details?: string; message?: string }): boolean =>
    `${error?.details ?? ''} ${error?.message ?? ''}`.includes('WALLET_NOT_FOUND');

/**
 * Document-side policy over the shared finance client: fail-safe quota lookup, fail-closed
 * charging with `doc:<storageId>` keys, and a refund that treats "never charged" as success.
 * AI_FREE_MODE (and its production force-off) lives in the shared client.
 */
@Injectable()
export class DocumentFinance {
    private readonly logger = new Logger(DocumentFinance.name);

    constructor(private readonly finance: FinanceClient) {}

    /** True in dev AI_FREE_MODE: no debit is ever made, so no refund is ever owed. */
    get freeMode(): boolean {
        return this.finance.freeMode;
    }

    /** `filesPerMonth` of the user's plan (-1 unlimited); Free-tier limit when finance is unreachable. */
    async filesPerMonth(userId: string): Promise<number> {
        try {
            const benefits = await this.finance.getUserBenefits(userId, buildMetadata());
            return benefits.filesPerMonth;
        } catch (error) {
            this.logger.error(`Error getting subscription benefits: ${(error as Error).message}`);
            return FREE_TIER_FILES_PER_MONTH;
        }
    }

    /**
     * Charges once per `idempotencyKey` (a replay returns the original). `userToken` is forwarded so
     * finance sees the user (a TEACHER without a wallet gets one on the first debit).
     */
    async debit(
        userId: string,
        amount: number,
        reason: string,
        idempotencyKey: string,
        userToken?: string
    ): Promise<DebitOutcome> {
        try {
            const result = await this.finance.debit(
                { userId, amount, reason, idempotencyKey },
                buildMetadata(userToken ? { authorization: `Bearer ${userToken}` } : {})
            );
            return { newBalance: result.skipped ? undefined : result.newBalance };
        } catch (error) {
            this.logger.error(`Failed to debit ${amount} credits from ${userId}: ${(error as Error).message}`);
            throw this.classify(error);
        }
    }

    /**
     * Reverses `Debit(idempotencyKey)` as `svc:document`, at most once. Returns false when the debit
     * never happened (finance: NOT_FOUND); any other failure propagates so the caller can retry later.
     */
    async refund(userId: string, idempotencyKey: string, reason: string): Promise<boolean> {
        if (this.finance.freeMode) return false;
        try {
            await this.finance.refund({ userId, debitIdempotencyKey: idempotencyKey, reason }, buildMetadata());
            return true;
        } catch (error) {
            if ((error as { code?: number })?.code === status.NOT_FOUND) return false;
            throw error;
        }
    }

    private classify(error: unknown): ChargeFailedError {
        const err = error as { code?: number; details?: string; message?: string };
        if (error instanceof HttpException && error.getStatus() === 400) {
            return new ChargeFailedError(true, error);
        }
        // Finance answered "no": the caller may not spend, or the request itself is malformed. Nothing was taken.
        if (err?.code === status.PERMISSION_DENIED) {
            return new ChargeFailedError(
                true,
                documentError(403, DocumentErrorCode.PERMISSION_DENIED, 'Bạn không có quyền thực hiện giao dịch tín dụng này.')
            );
        }
        if (err?.code === status.INVALID_ARGUMENT) {
            return new ChargeFailedError(
                true,
                documentError(400, DocumentErrorCode.VALIDATION_FAILED, 'Yêu cầu giao dịch tín dụng không hợp lệ.')
            );
        }
        if (err?.code === status.FAILED_PRECONDITION && walletMissing(err)) {
            return new ChargeFailedError(
                true,
                documentError(
                    403,
                    DocumentErrorCode.WALLET_NOT_FOUND,
                    'Ví chưa được khởi tạo, vui lòng thử lại sau hoặc liên hệ hỗ trợ.'
                )
            );
        }
        if (err?.code === status.FAILED_PRECONDITION) {
            return new ChargeFailedError(
                true,
                documentError(
                    403,
                    DocumentErrorCode.INSUFFICIENT_CREDITS,
                    'Không đủ tín dụng: Insufficient balance. Vui lòng nạp thêm.'
                )
            );
        }
        // Connection errors fail closed; the debit may or may not have been applied.
        return new ChargeFailedError(
            false,
            documentError(
                403,
                DocumentErrorCode.CHARGE_UNAVAILABLE,
                'Không thể thực hiện giao dịch tín dụng lúc này.'
            )
        );
    }
}
