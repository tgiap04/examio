import {
    Injectable,
    ForbiddenException,
    HttpException,
    Logger,
} from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { buildMetadata, FinanceClient } from '@examio/grpc';
import { subscriptionV1 } from '@examio/contracts';

type UserBenefits = subscriptionV1.GetUserBenefitsResponse;

export interface DeductionResult {
    success: true;
    newBalance?: number;
    message: string;
}

export interface DeductOptions {
    /**
     * Raw access token of the HTTP caller. Forwarded as the gRPC `authorization`
     * so finance sees the user (a TEACHER without a wallet gets one minted on
     * the first debit). Omit for background work: the service token is used and
     * a missing wallet is an error. Never logged.
     */
    userToken?: string;
}

const walletMissing = (error: { details?: string; message?: string }): boolean =>
    `${error?.details ?? ''} ${error?.message ?? ''}`.includes('WALLET_NOT_FOUND');

/**
 * Exam-side policy over the shared finance client: fail-safe benefits and
 * fail-closed charging. The AI_FREE_MODE bypass and its production force-off
 * live in the shared client (`@examio/grpc`).
 */
@Injectable()
export class FinanceClientService {
    private readonly logger = new Logger(FinanceClientService.name);

    constructor(private readonly finance: FinanceClient) {}

    private getFreeTierDefaults(): UserBenefits {
        return {
            tier: 0,
            tierName: 'Free',
            filesPerMonth: 5,
            messagesPerMinute: 5,
            chatMessagesLimit: 30,
        };
    }

    /**
     * Get subscription benefits for a user via gRPC.
     * Fails safe to conservative Free-tier defaults if the subscription
     * service is unavailable or the client isn't initialized yet.
     */
    async getUserBenefits(userId: string): Promise<UserBenefits> {
        try {
            return await this.finance.getUserBenefits(userId, buildMetadata());
        } catch (error) {
            this.logger.error(
                `Error getting subscription benefits: ${error.message}`
            );
            return this.getFreeTierDefaults();
        }
    }

    /**
     * Charges `amount` credits once per `idempotencyKey` (a replay is a no-op
     * returning the original balance). Fails closed: any error blocks the
     * operation.
     */
    async deductCredits(
        userId: string,
        amount: number,
        description: string,
        idempotencyKey: string,
        options: DeductOptions = {}
    ): Promise<DeductionResult> {
        if (amount <= 0) {
            return { success: true, newBalance: undefined, message: 'No charge' };
        }

        try {
            const result = await this.finance.debit(
                { userId, amount, reason: description, idempotencyKey },
                buildMetadata(
                    options.userToken
                        ? { authorization: `Bearer ${options.userToken}` }
                        : {}
                )
            );
            if (result.skipped) {
                return { success: true, newBalance: undefined, message: 'Free mode - no charge' };
            }
            this.logger.log(
                `Deducted ${amount} credits from user ${userId}: ${description}${result.alreadyApplied ? ' (already applied)' : ''}`
            );
            return {
                success: true,
                newBalance: result.newBalance,
                message: 'Balance updated successfully',
            };
        } catch (error) {
            this.logger.error(`Failed to deduct credits: ${error.message}`);
            // Invalid amount / key (400 from the client guard) keeps its reason.
            if (error instanceof HttpException && error.getStatus() === 400) throw error;
            if (error?.code === status.FAILED_PRECONDITION && walletMissing(error)) {
                throw new ForbiddenException(
                    'Ví chưa được khởi tạo, vui lòng thử lại sau hoặc liên hệ hỗ trợ.'
                );
            }
            if (error?.code === status.FAILED_PRECONDITION) {
                throw new ForbiddenException(
                    'Không đủ tín dụng: Insufficient balance. Vui lòng nạp thêm.'
                );
            }
            // Connection errors fail closed ("tuân thủ đúng").
            throw new ForbiddenException(
                'Không thể thực hiện giao dịch tín dụng lúc này.'
            );
        }
    }
}
