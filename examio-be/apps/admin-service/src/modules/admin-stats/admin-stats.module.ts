import { Module } from '@nestjs/common';
import { PrismaService } from '@examio/database';
import { RedisModule } from '@examio/redis';

import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsService } from './admin-stats.service';

@Module({
    imports: [RedisModule],
    controllers: [AdminStatsController],
    providers: [AdminStatsService, PrismaService],
    exports: [AdminStatsService],
})
export class AdminStatsModule {}
