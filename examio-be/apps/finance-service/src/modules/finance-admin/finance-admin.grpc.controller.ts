import { Controller } from '@nestjs/common';
import { Metadata, status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { financeAdminV1 } from '@examio/contracts';
import { principalOfMetadata, RequirePermissions } from '@examio/auth-jwt';
import { FinanceAdminService } from './finance-admin.service';
import { UserFinanceService } from './user-finance.service';

/** The actor is the verified admin token subject, never a request field. */
function actorOf(metadata: Metadata): string {
    const principal = principalOfMetadata(metadata);
    if (principal?.kind !== 'user') {
        throw new RpcException({ code: status.PERMISSION_DENIED, message: 'PERMISSION_DENIED' });
    }
    return principal.id;
}

@Controller()
@financeAdminV1.FinanceAdminServiceControllerMethods()
export class FinanceAdminGrpcController implements financeAdminV1.FinanceAdminServiceController {
    constructor(
        private readonly admin: FinanceAdminService,
        private readonly userFinance: UserFinanceService
    ) {}

    @RequirePermissions('finance:admin')
    adjustBalance(req: financeAdminV1.AdjustBalanceRequest, metadata: Metadata) {
        return this.admin.adjustBalance(req, actorOf(metadata));
    }

    @RequirePermissions('finance:admin')
    refundPayment(req: financeAdminV1.RefundPaymentRequest, metadata: Metadata) {
        return this.admin.refundPayment(req, actorOf(metadata));
    }

    @RequirePermissions('finance:admin')
    changeTier(req: financeAdminV1.ChangeTierRequest, metadata: Metadata) {
        return this.admin.changeTier(req, actorOf(metadata));
    }

    @RequirePermissions('finance:admin')
    listPayments(req: financeAdminV1.ListPaymentsRequest) {
        return this.admin.listPayments(req);
    }

    @RequirePermissions('finance:admin')
    listSubscriptions(req: financeAdminV1.ListSubscriptionsRequest) {
        return this.admin.listSubscriptions(req);
    }

    @RequirePermissions('finance:admin')
    getUserFinance(req: financeAdminV1.GetUserFinanceRequest) {
        return this.userFinance.get(req.userId);
    }
}
