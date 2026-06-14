import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule, PrismaService } from '@examio/database';
import { AuthModule } from '@examio/common';
import { RedisModule } from '@examio/redis';

import { AdminServiceController } from './admin-service.controller';
import { AdminServiceService } from './admin-service.service';
import { AdminFinanceModule } from './modules/admin-finance/admin-finance.module';
import { AdminStatsModule } from './modules/admin-stats/admin-stats.module';
import { AdminBootstrapModule } from './modules/admin-bootstrap/admin-bootstrap.module';
import { AdminLogsModule } from './modules/admin-logs/admin-logs.module';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';
import { AdminAuditModule } from './modules/admin-audit/admin-audit.module';
import { AdminWordFamilyModule } from './modules/admin-word-family/admin-word-family.module';

@Module({
    imports: [
        DatabaseModule,
        RedisModule,
        AuthModule,
        ThrottlerModule.forRoot([
            {
                name: 'admin',
                ttl: 60000,
                limit: 30,
            },
        ]),
        AdminStatsModule,
        AdminFinanceModule,
        AdminBootstrapModule,
        AdminLogsModule,
        AdminUsersModule,
        AdminAuditModule,
        AdminWordFamilyModule,
    ],
    controllers: [AdminServiceController],
    providers: [AdminServiceService, PrismaService],
})
export class AdminServiceModule {}
