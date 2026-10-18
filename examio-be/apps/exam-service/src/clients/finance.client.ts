import {
    HttpException,
    Inject,
    Injectable,
    OnModuleInit,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import {
    PROTO_FILES,
    subscriptionV1,
    walletV1,
} from '@examio/contracts';
import { GrpcClientRegistration, invokeRpc } from '@examio/grpc';

export const FINANCE_GRPC = 'FINANCE_GRPC';

export const FINANCE_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: FINANCE_GRPC,
    pkg: PROTO_FILES.wallet.pkg,
    protoFile: [PROTO_FILES.wallet.file, PROTO_FILES.subscription.file],
    urlEnv: 'FINANCE_GRPC_URL',
};

const WALLET = `${PROTO_FILES.wallet.pkg}.${walletV1.WALLET_SERVICE_NAME}`;
const SUBSCRIPTION = `${PROTO_FILES.subscription.pkg}.${subscriptionV1.SUBSCRIPTION_SERVICE_NAME}`;

const INT32_MAX = 2_147_483_647;

/**
 * Money is whole credits (int32 on the wire). The ts-proto encoder silently
 * truncates 5.5 to 5, so reject anything else before it reaches the encoder.
 */
export function assertWholeCredits(amount: number, field = 'amount'): void {
    if (!Number.isInteger(amount) || amount <= 0 || amount > INT32_MAX) {
        throw new HttpException(
            {
                statusCode: 400,
                code: 'INVALID_AMOUNT',
                message: `${field} must be a positive whole number of credits`,
            },
            400
        );
    }
}

/** Typed gateway to finance-service. Every call takes explicit metadata. */
@Injectable()
export class FinanceClient implements OnModuleInit {
    private wallet!: walletV1.WalletServiceClient;
    private subscription!: subscriptionV1.SubscriptionServiceClient;

    constructor(@Inject(FINANCE_GRPC) private readonly client: ClientGrpc) {}

    onModuleInit(): void {
        this.wallet = this.client.getService<walletV1.WalletServiceClient>(
            walletV1.WALLET_SERVICE_NAME
        );
        this.subscription =
            this.client.getService<subscriptionV1.SubscriptionServiceClient>(
                subscriptionV1.SUBSCRIPTION_SERVICE_NAME
            );
    }

    getUserBenefits(
        userId: string,
        metadata: Metadata
    ): Promise<subscriptionV1.GetUserBenefitsResponse> {
        return invokeRpc(`${SUBSCRIPTION}/GetUserBenefits`, (options) =>
            this.subscription.getUserBenefits({ userId }, metadata, options)
        );
    }

    /**
     * @deprecated Current debit/credit path; phase 10 switches callers to the
     * idempotent Debit/Credit RPCs. Never retried (no idempotency key).
     */
    async updateBalance(
        request: walletV1.UpdateBalanceRequest,
        metadata: Metadata
    ): Promise<walletV1.UpdateBalanceResponse> {
        assertWholeCredits(request.amount);
        return invokeRpc(`${WALLET}/UpdateBalance`, (options) =>
            this.wallet.updateBalance(request, metadata, options)
        );
    }
}
