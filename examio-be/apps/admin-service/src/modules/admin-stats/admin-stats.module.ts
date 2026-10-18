import { Module } from '@nestjs/common';
import { PrismaService } from '@examio/database';
import { RedisModule } from '@examio/redis';

import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsFeRoutesController } from './admin-stats-fe-routes.controller';
import { AdminStatsService } from './admin-stats.service';

@Module({
    imports: [RedisModule],
    controllers: [AdminStatsController, AdminStatsFeRoutesController],
    providers: [AdminStatsService, PrismaService],
    exports: [AdminStatsService],
})
export class AdminStatsModule {}
