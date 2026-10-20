import {
    BadRequestException,
    Injectable,
    NotFoundException,
    ForbiddenException,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '@examio/database';
import { SepayWebhook } from '../../types/webhook';
import { getPaymentIdFromWebhook } from '../../utils/handleWebhook';
import { PAYMENT_STATUS } from '../../types/payment';
import { WalletRepository } from '../wallet/wallet.repository';
import { WalletTransactionRepository } from '../wallet/wallettransaction.repository';
import { GenerateIdService, invalidateWalletCachesBestEffort } from '@examio/common';
import { RedisService } from '@examio/redis';
import { WALLET_TRANSACTION_TYPE } from '../wallet/dto/wallet-details-response.dto';
import { SubscriptionService } from './subscription.service';
import {
    SUBSCRIPTION_TIER,
    getSubscriptionTierFromPrice,
} from '../../types/subscription';

@Injectable()
export class WebhookService {
    private readonly logger = new Logger(WebhookService.name);
    private readonly webhookSecretKey = process.env.PAYMENT_WEBHOOK_SECRET_KEY;

    constructor(
        private readonly prisma: PrismaService,
        private readonly walletRepository: WalletRepository,
        private readonly walletTransactionRepository: WalletTransactionRepository,
        private readonly generateIdService: GenerateIdService,
        private readonly subscriptionService: SubscriptionService,
        private readonly redis: RedisService
    ) {}


    /** A cache problem must never turn a committed payment into a failed webhook (SePay would retry). */
    private async invalidateAfterCommit(userId: string): Promise<void> {
        const walletId = await this.walletRepository
            .findByUserId(userId, false)
            .then((w) => w?.id)
            .catch(() => undefined);
        await invalidateWalletCachesBestEffort(this.redis, userId, walletId);
    }

    private isValidApiKey(apiKey?: string): boolean {
        if (!this.webhookSecretKey || !apiKey) {
            return false;
        }

        const expected = Buffer.from(this.webhookSecretKey);
        const received = Buffer.from(apiKey);

        if (expected.length !== received.length) {
            return false;
        }

        return crypto.timingSafeEqual(received, expected);
    }

    /**
     * Xử lý webhook từ SePay khi có giao dịch chuyển khoản
     * 1. Parse paymentId từ nội dung
     * 2. Validate payment tồn tại và chưa thanh toán
     * 3. Cập nhật payment status = PAID
     * 4. Dựa vào paymentType:
     *    - credits: Cộng credits vào wallet
     *    - subscription: Kích hoạt/nâng cấp subscription
     */
    async processWebhook(
        data: SepayWebhook,
        apiKey: string
    ): Promise<{ success: boolean }> {
        if (!this.isValidApiKey(apiKey)) {
            this.logger.warn(`Invalid API key received`);
            throw new UnauthorizedException('Invalid API key');
        }

        // Chỉ xử lý tiền vào
        if (data.transferType !== 'in') {
            this.logger.log(
                `Ignoring outgoing transfer: ${data.referenceCode}`
            );
            return { success: true };
        }

        const paymentId = getPaymentIdFromWebhook(data.content);

        if (!paymentId) {
            this.logger.warn(
                `Cannot extract paymentId from content (${data.content?.length ?? 0} chars)`
            );
            return { success: false };
        }

        this.logger.log(`Processing payment: ${paymentId}`);

        // Tìm payment
        const payment = await this.prisma.payment.findUnique({
            where: { id: paymentId },
        });

        if (!payment) {
            this.logger.warn(`Payment not found: ${paymentId}`);
            throw new NotFoundException('Payment not found');
        }

        // Kiểm tra trạng thái
        // Lưu ý: không throw ConflictException ở đây khi status đã là PAID.
        // Việc chuyển trạng thái PENDING -> PAID được xử lý atomic + idempotent
        // bên trong transaction (processCreditPayment / processSubscriptionPayment)
        // để tránh race condition (TOCTOU) khi SePay gửi webhook trùng lặp/đồng thời:
        // nếu payment đã được xử lý bởi một lần gọi khác, ta trả về idempotent no-op
        // thay vì double-credit ví.
        if (payment.status === PAYMENT_STATUS.CANCELED) {
            this.logger.warn(`Payment was cancelled: ${paymentId}`);
            throw new ForbiddenException(
                'This payment has been canceled and cannot be processed'
            );
        }

        if (payment.status === PAYMENT_STATUS.OVERDUE) {
            this.logger.warn(`Payment is overdue: ${paymentId}`);
            throw new ForbiddenException(
                'This payment is overdue and cannot be processed'
            );
        }

        // Số tiền nhận được
        const amountReceived = data.transferAmount;

        if (amountReceived !== payment.amount) {
            this.logger.warn(
                `Amount mismatch: expected ${payment.amount}, got ${amountReceived}`
            );
            throw new BadRequestException('Payment amount does not match');
        }

        if (payment.paymentType === 'subscription') {
            await this.processSubscriptionPayment(
                payment,
                paymentId,
                amountReceived
            );
        } else {
            await this.processCreditPayment(payment, paymentId, amountReceived);
        }

        return { success: true };
    }

    /**
     * Xử lý thanh toán mua credits
     */
    private async processCreditPayment(
        payment: any,
        paymentId: string,
        amountReceived: number
    ) {
        // Tính số credits dựa trên số tiền (1000 VND = 1 credit)
        const creditsToAdd = Math.floor(amountReceived / 1000);

        // Sử dụng transaction để đảm bảo tính nhất quán và chống double-credit
        const result = await this.prisma.$transaction(async (tx) => {
            // 1. Chuyển trạng thái payment PENDING -> PAID một cách atomic + idempotent.
            // Nếu payment đã được xử lý bởi một lần gọi webhook khác (đồng thời hoặc
            // gửi lại), count sẽ là 0 và ta bỏ qua bước cộng credits để tránh double-credit.
            const updateResult = await tx.payment.updateMany({
                where: {
                    id: paymentId,
                    status: { not: PAYMENT_STATUS.PAID },
                },
                data: {
                    status: PAYMENT_STATUS.PAID,
                    amount: amountReceived,
                    updatedBy: 'SEPAY_WEBHOOK',
                },
            });

            if (updateResult.count === 0) {
                return { credited: false, hasWallet: false };
            }

            // 2. Cộng credits vào wallet (đọc trong transaction để tránh lost update)
            const wallet = await tx.wallet.findUnique({
                where: { userId: payment.userId },
            });

            if (wallet) {
                await tx.wallet.update({
                    where: { id: wallet.id },
                    data: {
                        balance: { increment: creditsToAdd },
                        updatedBy: 'SEPAY_WEBHOOK',
                    },
                });

                // 3. Tạo wallet transaction
                await tx.walletTransaction.create({
                    data: {
                        id: this.generateIdService.generateId(),
                        walletId: wallet.id,
                        amount: creditsToAdd,
                        type: WALLET_TRANSACTION_TYPE.BUY_CREDITS,
                        direction: 'ADD',
                        description: `Nạp ${creditsToAdd} credits từ chuyển khoản ${amountReceived.toLocaleString('vi-VN')} VND`,
                        createdBy: 'SEPAY_WEBHOOK',
                    },
                });
            }

            return { credited: true, hasWallet: !!wallet };
        });

        if (!result.credited) {
            this.logger.warn(
                `Payment ${paymentId} already processed by another webhook delivery; skipping duplicate credit`
            );
            return;
        }

        // After commit, best effort: wallet, wallet transactions and payment caches
        await this.invalidateAfterCommit(payment.userId);

        this.logger.log(
            `Credit payment ${paymentId} processed: +${creditsToAdd} credits for user ${payment.userId}`
        );
    }

    /**
     * Xử lý thanh toán đăng ký subscription
     */
    private async processSubscriptionPayment(
        payment: any,
        paymentId: string,
        amountReceived: number
    ) {
        // Xác định tier và billing cycle từ số tiền đã được đối soát.
        const { tier, billingCycle } =
            getSubscriptionTierFromPrice(payment.amount);

        if (tier === SUBSCRIPTION_TIER.NONE) {
            this.logger.warn(
                `Cannot determine subscription tier from amount: ${payment.amount}`
            );
            throw new BadRequestException('Invalid subscription payment amount');
        }

        // Cập nhật payment status PENDING -> PAID (atomic + idempotent) và kích hoạt
        // subscription trong cùng một transaction để tránh double-activation khi có
        // nhiều webhook delivery đồng thời cho cùng một paymentId.
        const processed = await this.prisma.$transaction(async (tx) => {
            const updateResult = await tx.payment.updateMany({
                where: {
                    id: paymentId,
                    status: { not: PAYMENT_STATUS.PAID },
                },
                data: {
                    status: PAYMENT_STATUS.PAID,
                    amount: amountReceived,
                    updatedBy: 'SEPAY_WEBHOOK',
                },
            });

            if (updateResult.count === 0) {
                return false;
            }

            // Kích hoạt subscription (bao gồm cả việc cộng credits hàng tháng)
            await this.subscriptionService.activateSubscription(
                payment.userId,
                tier,
                billingCycle,
                tx
            );

            return true;
        });

        if (!processed) {
            this.logger.warn(
                `Payment ${paymentId} already processed by another webhook delivery; skipping duplicate subscription activation`
            );
            return;
        }

        // After commit, best effort: wallet, wallet transactions and payment caches
        await this.invalidateAfterCommit(payment.userId);

        this.logger.log(
            `Subscription payment ${paymentId} processed: tier ${tier}, cycle ${billingCycle} for user ${payment.userId}`
        );
    }
}
