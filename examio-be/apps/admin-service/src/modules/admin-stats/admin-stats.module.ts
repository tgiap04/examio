import { Module } from '@nestjs/common';
import { GrpcClientModule } from '@examio/grpc';
import { RedisModule } from '@examio/redis';

import {
    AUTH_USERS_GRPC_REGISTRATION,
    AuthUsersClient,
} from '../../clients/auth-users.client';
import {
    FINANCE_ADMIN_GRPC_REGISTRATION,
    FinanceClient,
} from '../../clients/finance.client';
import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsFeRoutesController } from './admin-stats-fe-routes.controller';
import { AdminStatsService } from './admin-stats.service';

@Module({
    imports: [
        RedisModule,
        GrpcClientModule.register(
            AUTH_USERS_GRPC_REGISTRATION,
            FINANCE_ADMIN_GRPC_REGISTRATION
        ),
    ],
    controllers: [AdminStatsController, AdminStatsFeRoutesController],
    providers: [AdminStatsService, AuthUsersClient, FinanceClient],
    exports: [AdminStatsService],
})
export class AdminStatsModule {}
