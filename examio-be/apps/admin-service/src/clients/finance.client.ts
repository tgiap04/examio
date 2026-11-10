import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import type { Observable } from 'rxjs';
import { PROTO_FILES, financeAdminV1 } from '@examio/contracts';
import {
    CallOptions,
    GrpcClientRegistration,
    grpcErrorToHttpException,
    invokeRpc,
} from '@examio/grpc';

export const FINANCE_ADMIN_GRPC = 'FINANCE_ADMIN_GRPC';

export const FINANCE_ADMIN_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: FINANCE_ADMIN_GRPC,
    pkg: PROTO_FILES.financeAdmin.pkg,
    protoFile: PROTO_FILES.financeAdmin.file,
    urlEnv: 'FINANCE_GRPC_URL',
};

const STATS_RPC = `${PROTO_FILES.financeAdmin.pkg}.${financeAdminV1.FINANCE_STATS_SERVICE_NAME}`;
const RPC = `${PROTO_FILES.financeAdmin.pkg}.${financeAdminV1.FINANCE_ADMIN_SERVICE_NAME}`;

/**
 * admin -> finance. Every call forwards the CALLING admin's own access token
 * (`forwardUser(req)`); finance takes the actor from its `sub` and checks
 * `finance:admin`. No request here ever carries an actor id. Writes carry an
 * idempotency key, which is what makes finance's retry-on-UNAVAILABLE safe.
 */
@Injectable()
export class FinanceClient implements OnModuleInit {
    private finance!: financeAdminV1.FinanceAdminServiceClient;
    private stats!: financeAdminV1.FinanceStatsServiceClient;

    constructor(@Inject(FINANCE_ADMIN_GRPC) private readonly client: ClientGrpc) {}

    onModuleInit(): void {
        this.finance = this.client.getService<financeAdminV1.FinanceAdminServiceClient>(
            financeAdminV1.FINANCE_ADMIN_SERVICE_NAME
        );
        this.stats = this.client.getService<financeAdminV1.FinanceStatsServiceClient>(
            financeAdminV1.FINANCE_STATS_SERVICE_NAME
        );
    }

    adjustBalance(req: financeAdminV1.AdjustBalanceRequest, md: Metadata) {
        return this.call('AdjustBalance', (o) => this.finance.adjustBalance(req, md, o));
    }

    refundPayment(req: financeAdminV1.RefundPaymentRequest, md: Metadata) {
        return this.call('RefundPayment', (o) => this.finance.refundPayment(req, md, o));
    }

    changeTier(req: financeAdminV1.ChangeTierRequest, md: Metadata) {
        return this.call('ChangeTier', (o) => this.finance.changeTier(req, md, o));
    }

    listPayments(req: financeAdminV1.ListPaymentsRequest, md: Metadata) {
        return this.call('ListPayments', (o) => this.finance.listPayments(req, md, o));
    }

    listSubscriptions(req: financeAdminV1.ListSubscriptionsRequest, md: Metadata) {
        return this.call('ListSubscriptions', (o) => this.finance.listSubscriptions(req, md, o));
    }

    getUserFinance(userId: string, md: Metadata) {
        return this.call('GetUserFinance', (o) => this.finance.getUserFinance({ userId }, md, o));
    }

    /** `stats:read` on the forwarded token; served by the sibling `FinanceStatsService`. */
    getRevenueStats(req: financeAdminV1.GetRevenueStatsRequest, md: Metadata) {
        return this.callStats('GetRevenueStats', (o) => this.stats.getRevenueStats(req, md, o));
    }

    /** gRPC errors surface as the matching HttpException; only allowlisted RPCs are retried. */
    private async call<T>(
        method: string,
        invoke: (options: CallOptions) => Observable<T>
    ): Promise<T> {
        try {
            return await invokeRpc(`${RPC}/${method}`, invoke);
        } catch (err) {
            throw grpcErrorToHttpException(err);
        }
    }

    private async callStats<T>(
        method: string,
        invoke: (options: CallOptions) => Observable<T>
    ): Promise<T> {
        try {
            return await invokeRpc(`${STATS_RPC}/${method}`, invoke);
        } catch (err) {
            throw grpcErrorToHttpException(err);
        }
    }
}
