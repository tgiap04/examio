import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import {
    DatabaseModule,
    DatabaseReadinessCheck,
    PrismaService,
} from '@examio/database';
import { RedisModule, RedisReadinessCheck } from '@examio/redis';

import { AdminServiceController } from './admin-service.controller';
import { AdminServiceService } from './admin-service.service';
import { AdminFinanceModule } from './modules/admin-finance/admin-finance.module';
import { AdminStatsModule } from './modules/admin-stats/admin-stats.module';
import { AdminLogsModule } from './modules/admin-logs/admin-logs.module';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';
import { AdminAuditModule } from './modules/admin-audit/admin-audit.module';
import { AdminWordFamilyModule } from './modules/admin-word-family/admin-word-family.module';
import { AdminPageConfigModule } from './modules/admin-page-config/admin-page-config.module';
import { HealthModule, LoggerModule } from '@examio/observability';
import { AuthJwtModule } from '@examio/auth-jwt';

@Module({
    imports: [
        LoggerModule.forRoot('admin-service'),
        HealthModule.forRoot({
            checks: [DatabaseReadinessCheck, RedisReadinessCheck],
        }),
        DatabaseModule,
        RedisModule,
        AuthJwtModule.forRoot({ serviceName: 'admin' }),
        ThrottlerModule.forRoot([
            {
                name: 'admin',
                ttl: 60000,
                limit: 30,
            },
        ]),
        AdminStatsModule,
        AdminFinanceModule,
        AdminLogsModule,
        AdminUsersModule,
        AdminAuditModule,
        AdminWordFamilyModule,
        AdminPageConfigModule,
    ],
    controllers: [AdminServiceController],
    providers: [AdminServiceService, PrismaService],
})
export class AdminServiceModule {}
