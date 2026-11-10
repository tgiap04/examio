import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import {
    PrismaModule,
    PrismaReadinessCheck,
    PrismaService,
} from './prisma';
import { RedisModule, RedisReadinessCheck } from '@examio/redis';

import { AdminServiceController } from './admin-service.controller';
import { AdminServiceService } from './admin-service.service';
import { AdminFinanceModule } from './modules/admin-finance/admin-finance.module';
import { AdminStatsModule } from './modules/admin-stats/admin-stats.module';
import { AdminLogsModule } from './modules/admin-logs/admin-logs.module';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';
import { AdminRolesModule } from './modules/admin-roles/admin-roles.module';
import { AdminAuditModule } from './modules/admin-audit/admin-audit.module';
import { AdminWordFamilyModule } from './modules/admin-word-family/admin-word-family.module';
import { AdminPageConfigModule } from './modules/admin-page-config/admin-page-config.module';
import { HealthModule, LoggerModule } from '@examio/observability';
import { AuthJwtModule } from '@examio/auth-jwt';

/** AUTH_TOKEN_URL + SERVICE_CLIENT_SECRET are mandatory in production; locally only when set. */
function serviceClientEnabled(): boolean {
    return (
        process.env.NODE_ENV === 'production' ||
        Boolean(process.env.SERVICE_CLIENT_SECRET && process.env.AUTH_TOKEN_URL)
    );
}

@Module({
    imports: [
        LoggerModule.forRoot('admin-service'),
        HealthModule.forRoot({
            checks: [PrismaReadinessCheck, RedisReadinessCheck],
        }),
        PrismaModule,
        RedisModule,
        // Service token (aud = gateway) for GatewayControl.SetPageFlags; required in
        // production, optional locally (the push then fails loudly with a 503).
        AuthJwtModule.forRoot({ serviceName: 'admin', serviceClient: serviceClientEnabled() }),
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
        AdminRolesModule,
        AdminAuditModule,
        AdminWordFamilyModule,
        AdminPageConfigModule,
    ],
    controllers: [AdminServiceController],
    providers: [AdminServiceService, PrismaService],
})
export class AdminServiceModule {}
