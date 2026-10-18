import {
    Injectable,
    ForbiddenException,
    HttpException,
    Logger,
} from '@nestjs/common';
import { buildMetadata } from '@examio/grpc';
import { subscriptionV1 } from '@examio/contracts';
import { FinanceClient } from '../../clients/finance.client';

type UserBenefits = subscriptionV1.GetUserBenefitsResponse;

/**
 * AI_FREE_MODE: Khi bật, bypass tất cả deduction credits.
 * Chỉ dùng cho dev local hoặc khi tắt tính năng tính tiền tạm thời.
 * Mặc định TẮT (charging enabled) và KHÔNG BAO GIỜ được bật ở production —
 * xem guard trong constructor bên dưới.
 */
function resolveFreeMode(): boolean {
    return process.env.AI_FREE_MODE === 'true';
}

@Injectable()
export class FinanceClientService {
    private readonly logger = new Logger(FinanceClientService.name);
    private readonly freeMode: boolean;

    constructor(private readonly finance: FinanceClient) {
        let freeMode = resolveFreeMode();

        // Production must never run with credit charging disabled.
        if (freeMode && process.env.NODE_ENV === 'production') {
            this.logger.error(
                'AI_FREE_MODE=true detected in production environment. Forcing free mode OFF to prevent revenue bypass.'
            );
            freeMode = false;
        }

        this.freeMode = freeMode;
    }

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

    async deductCredits(userId: string, amount: number, description: string) {
        // AI_FREE_MODE: Bypass credit deduction, always return success
        if (this.freeMode) {
            this.logger.log(
                `[FREE_MODE] Skipped deducting ${amount} credits from user ${userId}: ${description}`
            );
            return {
                success: true,
                newBalance: undefined,
                message: 'Free mode - no charge',
            };
        }

        if (amount <= 0)
            return {
                success: true,
                newBalance: undefined,
                message: 'No charge',
            }; // No charge

        try {
            const result = await this.finance.updateBalance(
                {
                    userId: userId,
                    amount: amount,
                    transactionType: 'SUBTRACT',
                    description: description,
                },
                buildMetadata()
            );

            if (!result.success) {
                // If failed (e.g. not enough balance), throw error to block operation
                throw new ForbiddenException(
                    `Không đủ tín dụng: ${result.message}. Vui lòng nạp thêm.`
                );
            }

            this.logger.log(
                `Deducted ${amount} credits from user ${userId}: ${description}`
            );
            return result;
        } catch (error) {
            this.logger.error(`Failed to deduct credits: ${error.message}`);
            if (error instanceof ForbiddenException) throw error;
            // Invalid amount (400 INVALID_AMOUNT from the client guard) keeps its reason
            if (error instanceof HttpException && error.getStatus() === 400) throw error;
            // For connection errors, do we fail open or closed?
            // "tuân thủ đúng". STRICT. Fail closed.
            throw new ForbiddenException(
                'Không thể thực hiện giao dịch tín dụng lúc này.'
            );
        }
    }

    async addCredits(userId: string, amount: number, description: string) {
        if (amount <= 0)
            return {
                success: true,
                newBalance: undefined,
                message: 'No refund needed',
            };

        try {
            const result = await this.finance.updateBalance(
                {
                    userId: userId,
                    amount: amount,
                    transactionType: 'ADD',
                    description: description,
                },
                buildMetadata()
            );

            this.logger.log(
                `Added ${amount} credits to user ${userId}: ${description}`
            );
            return result;
        } catch (error) {
            this.logger.error(`Failed to add credits: ${error.message}`);
            // For refunds, we don't block the operation if it fails
            return {
                success: false,
                newBalance: undefined,
                message: error.message,
            };
        }
    }
}
