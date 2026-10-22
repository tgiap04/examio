import { Controller } from '@nestjs/common';
import { financeAdminV1 } from '@examio/contracts';
import { RequirePermissions } from '@examio/auth-jwt';
import { FinanceStatsService } from './finance-stats.service';

/** Admin-overview aggregates; the forwarded admin token must carry `stats:read`. */
@Controller()
@financeAdminV1.FinanceStatsServiceControllerMethods()
export class FinanceStatsGrpcController implements financeAdminV1.FinanceStatsServiceController {
    constructor(private readonly stats: FinanceStatsService) {}

    @RequirePermissions('stats:read')
    getRevenueStats(req: financeAdminV1.GetRevenueStatsRequest) {
        return this.stats.getRevenueStats(req);
    }
}
