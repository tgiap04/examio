import { Module } from '@nestjs/common';
import { GrpcClientModule } from '@kmaedu/grpc';
import { RedisModule } from '@kmaedu/redis';

import {
    AUTH_USERS_GRPC_REGISTRATION,
    AuthUsersClient,
} from '../../clients/auth-users.client';
import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsFeRoutesController } from './admin-stats-fe-routes.controller';
import { AdminStatsService } from './admin-stats.service';

@Module({
    imports: [
        RedisModule,
        GrpcClientModule.register(AUTH_USERS_GRPC_REGISTRATION),
    ],
    controllers: [AdminStatsController, AdminStatsFeRoutesController],
    providers: [AdminStatsService, AuthUsersClient],
    exports: [AdminStatsService],
})
export class AdminStatsModule {}
