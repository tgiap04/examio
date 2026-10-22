import { Module } from '@nestjs/common';
import { GrpcClientModule } from '@examio/grpc';

import { AdminCommonModule } from '../../common/admin-common.module';
import {
    FINANCE_ADMIN_GRPC_REGISTRATION,
    FinanceClient,
} from '../../clients/finance.client';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminFinanceService } from './admin-finance.service';

@Module({
    imports: [
        AdminCommonModule,
        GrpcClientModule.register(FINANCE_ADMIN_GRPC_REGISTRATION),
    ],
    controllers: [AdminFinanceController],
    providers: [AdminFinanceService, FinanceClient],
    exports: [AdminFinanceService],
})
export class AdminFinanceModule {}
