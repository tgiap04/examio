import {
    Injectable,
    Inject,
    OnModuleInit,
    ForbiddenException,
    Logger,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';

interface WalletService {
    updateBalance(data: {
        userId: string;
        amount: number;
        transactionType: string;
        description: string;
    }): Observable<{
        success: boolean;
        newBalance: number;
        message: string;
    }>;
}

interface SubscriptionService {
    getUserBenefits(data: { userId: string }): Observable<UserBenefits>;
}

interface UserBenefits {
    tier: number;
    tier_name: string;
    files_per_month: number;
    messages_per_minute: number;
    chat_messages_limit: number;
}

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
export class FinanceClientService implements OnModuleInit {
    private readonly logger = new Logger(FinanceClientService.name);
    private walletService: WalletService;
    private subscriptionService: SubscriptionService;
    private readonly freeMode: boolean;

    constructor(@Inject('FINANCE_PACKAGE') private client: ClientGrpc) {
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

    onModuleInit() {
        this.walletService =
            this.client.getService<WalletService>('WalletService');
        this.subscriptionService =
            this.client.getService<SubscriptionService>(
                'SubscriptionService'
            );
    }

    private getFreeTierDefaults(): UserBenefits {
        return {
            tier: 0,
            tier_name: 'Free',
            files_per_month: 5,
            messages_per_minute: 5,
            chat_messages_limit: 30,
        };
    }

    /**
     * Get subscription benefits for a user via gRPC.
     * Fails safe to conservative Free-tier defaults if the subscription
     * service is unavailable or the client isn't initialized yet.
     */
    async getUserBenefits(userId: string): Promise<UserBenefits> {
        try {
            if (!this.subscriptionService) {
                this.logger.warn(
                    'SubscriptionService GRPC client not initialized'
                );
                return this.getFreeTierDefaults();
            }
            return await firstValueFrom(
                this.subscriptionService.getUserBenefits({ userId })
            );
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
            const result = await firstValueFrom(
                this.walletService.updateBalance({
                    userId: userId,
                    amount: amount,
                    transactionType: 'SUBTRACT',
                    description: description,
                })
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
            const result = await firstValueFrom(
                this.walletService.updateBalance({
                    userId: userId,
                    amount: amount,
                    transactionType: 'ADD',
                    description: description,
                })
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
