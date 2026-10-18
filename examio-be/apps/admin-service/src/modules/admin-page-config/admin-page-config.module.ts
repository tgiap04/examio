import { Module } from '@nestjs/common';
import { DatabaseModule, PrismaService } from '@examio/database';
import { RedisModule } from '@examio/redis';

import { AdminPageConfigController } from './admin-page-config.controller';
import { AdminPageConfigService } from './admin-page-config.service';

@Module({
    imports: [DatabaseModule, RedisModule],
    controllers: [AdminPageConfigController],
    providers: [AdminPageConfigService, PrismaService],
    exports: [AdminPageConfigService],
})
export class AdminPageConfigModule {}
