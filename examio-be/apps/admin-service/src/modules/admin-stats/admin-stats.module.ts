import { Module } from '@nestjs/common';
import { PrismaService } from '@examio/database';
import { RedisModule } from '@examio/redis';
import { AdminGuard, AuthModule } from '@examio/common';

import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsFeRoutesController } from './admin-stats-fe-routes.controller';
import { AdminStatsService } from './admin-stats.service';

@Module({
    imports: [RedisModule, AuthModule],
    controllers: [AdminStatsController, AdminStatsFeRoutesController],
    providers: [AdminStatsService, PrismaService, AdminGuard],
    exports: [AdminStatsService],
})
export class AdminStatsModule {}
