import { Module } from '@nestjs/common';
import { GrpcClientModule } from '@examio/grpc';

import { AdminCommonModule } from '../../common/admin-common.module';
import { AUTH_USERS_GRPC_REGISTRATION, AuthUsersClient } from '../../clients/auth-users.client';
import {
    FINANCE_ADMIN_GRPC_REGISTRATION,
    FinanceClient,
} from '../../clients/finance.client';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminFinanceService } from './admin-finance.service';

@Module({
    imports: [
        AdminCommonModule,
        GrpcClientModule.register(
            FINANCE_ADMIN_GRPC_REGISTRATION,
            AUTH_USERS_GRPC_REGISTRATION
        ),
    ],
    controllers: [AdminFinanceController],
    providers: [AdminFinanceService, FinanceClient, AuthUsersClient],
    exports: [AdminFinanceService],
})
export class AdminFinanceModule {}
