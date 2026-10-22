import { HttpException, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { PROTO_FILES, subscriptionV1, walletV1 } from '@examio/contracts';
import { invokeRpc } from '../deadline-retry';
import { GrpcClientRegistration } from '../grpc-client.module';

export const FINANCE_GRPC = 'FINANCE_GRPC';

/**
 * How a caller turns its metadata into one carrying a service token for the
 * target audience (`ServiceMetadata` from `@examio/auth-jwt` satisfies this;
 * a structural contract keeps `libs/grpc` free of an auth-jwt dependency).
 */
export interface GrpcMetadataAttacher {
    attach(metadata: Metadata, audience: string): Promise<Metadata>;
}
export const GRPC_METADATA_ATTACHER = 'GRPC_METADATA_ATTACHER';

export const FINANCE_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: FINANCE_GRPC,
    pkg: PROTO_FILES.wallet.pkg,
    protoFile: [PROTO_FILES.wallet.file, PROTO_FILES.subscription.file],
    urlEnv: 'FINANCE_GRPC_URL',
};

const WALLET = `${PROTO_FILES.wallet.pkg}.${walletV1.WALLET_SERVICE_NAME}`;
const SUBSCRIPTION = `${PROTO_FILES.subscription.pkg}.${subscriptionV1.SUBSCRIPTION_SERVICE_NAME}`;
const INT32_MAX = 2_147_483_647;

const invalid = (code: string, message: string) =>
    new HttpException({ statusCode: 400, code, message }, 400);

/**
 * Money is whole credits (int32 on the wire). The ts-proto encoder silently
 * truncates 5.5 to 5, so reject anything else before it reaches the encoder.
 */
export function assertWholeCredits(amount: number, field = 'amount'): void {
    if (!Number.isInteger(amount) || amount <= 0 || amount > INT32_MAX) {
        throw invalid('INVALID_AMOUNT', `${field} must be a positive whole number of credits`);
    }
}

export interface DebitResult {
    /** True when AI_FREE_MODE skipped the charge (no RPC was made). */
    skipped: boolean;
    alreadyApplied: boolean;
    transaction?: walletV1.WalletTransaction;
    /** Balance after the debit; undefined when skipped. */
    newBalance?: number;
}

/**
 * AI_FREE_MODE bypasses charging for dev/local only. It is NEVER honoured in
 * production (revenue bypass), regardless of the variable.
 */
export function resolveFreeMode(
    env: NodeJS.ProcessEnv = process.env,
    logger?: Pick<Logger, 'error'>
): boolean {
    if (env.AI_FREE_MODE !== 'true') return false;
    if (env.NODE_ENV === 'production') {
        logger?.error(
            'AI_FREE_MODE=true detected in production environment. Forcing free mode OFF to prevent revenue bypass.'
        );
        return false;
    }
    return true;
}

/**
 * Typed gateway to finance-service shared by every caller (exam now; content
 * and document in phases 14/15). Every call takes explicit metadata; a service
 * token for audience `finance` is attached unless the metadata already
 * forwards a user token. Retries follow the IDEMPOTENT_RPCS allowlist.
 */
@Injectable()
export class FinanceClient implements OnModuleInit {
    private readonly logger = new Logger(FinanceClient.name);
    private wallet!: walletV1.WalletServiceClient;
    private subscription!: subscriptionV1.SubscriptionServiceClient;
    readonly freeMode: boolean;

    constructor(
        @Inject(FINANCE_GRPC) private readonly client: ClientGrpc,
        @Inject(GRPC_METADATA_ATTACHER) private readonly attacher: GrpcMetadataAttacher
    ) {
        this.freeMode = resolveFreeMode(process.env, this.logger);
    }

    onModuleInit(): void {
        this.wallet = this.client.getService<walletV1.WalletServiceClient>(
            walletV1.WALLET_SERVICE_NAME
        );
        this.subscription = this.client.getService<subscriptionV1.SubscriptionServiceClient>(
            subscriptionV1.SUBSCRIPTION_SERVICE_NAME
        );
    }

    async getUserBenefits(
        userId: string,
        metadata: Metadata
    ): Promise<subscriptionV1.GetUserBenefitsResponse> {
        const md = await this.attacher.attach(metadata, 'finance');
        return invokeRpc(`${SUBSCRIPTION}/GetUserBenefits`, (o) =>
            this.subscription.getUserBenefits({ userId }, md, o)
        );
    }

    async getWallet(userId: string, metadata: Metadata): Promise<walletV1.GetWalletResponse> {
        const md = await this.attacher.attach(metadata, 'finance');
        return invokeRpc(`${WALLET}/GetWallet`, (o) => this.wallet.getWallet({ userId }, md, o));
    }

    /**
     * Idempotent debit. A repeated `idempotencyKey` returns the original
     * transaction (`alreadyApplied`). gRPC errors (INSUFFICIENT_CREDITS is
     * FAILED_PRECONDITION) propagate to the caller.
     */
    async debit(request: walletV1.DebitRequest, metadata: Metadata): Promise<DebitResult> {
        if (this.freeMode) {
            this.logger.log(
                `[FREE_MODE] Skipped debiting ${request.amount} credits from ${request.userId}: ${request.reason}`
            );
            return { skipped: true, alreadyApplied: false };
        }
        this.assertMoneyRequest(request.amount, request.idempotencyKey);
        const md = await this.attacher.attach(metadata, 'finance');
        const res = await invokeRpc(`${WALLET}/Debit`, (o) => this.wallet.debit(request, md, o));
        return {
            skipped: false,
            alreadyApplied: res.alreadyApplied,
            transaction: res.transaction,
            newBalance: res.transaction?.balanceAfter,
        };
    }

    async credit(
        request: walletV1.CreditRequest,
        metadata: Metadata
    ): Promise<walletV1.CreditResponse> {
        this.assertMoneyRequest(request.amount, request.idempotencyKey);
        const md = await this.attacher.attach(metadata, 'finance');
        return invokeRpc(`${WALLET}/Credit`, (o) => this.wallet.credit(request, md, o));
    }

    /** Reverses the debit stored under `debitIdempotencyKey`, at most once. */
    async refund(
        request: walletV1.RefundRequest,
        metadata: Metadata
    ): Promise<walletV1.RefundResponse> {
        if (!request.debitIdempotencyKey?.trim()) {
            throw invalid('IDEMPOTENCY_KEY_REQUIRED', 'debitIdempotencyKey is required');
        }
        const md = await this.attacher.attach(metadata, 'finance');
        return invokeRpc(`${WALLET}/Refund`, (o) => this.wallet.refund(request, md, o));
    }

    private assertMoneyRequest(amount: number, idempotencyKey: string): void {
        assertWholeCredits(amount);
        if (!idempotencyKey?.trim()) {
            throw invalid('IDEMPOTENCY_KEY_REQUIRED', 'idempotencyKey is required');
        }
    }
}
