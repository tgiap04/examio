import { Module } from '@nestjs/common';
import { DatabaseModule, PrismaService } from '@examio/database';
import { RedisModule } from '@examio/redis';
import { AdminGuard, AuthModule } from '@examio/common';

import { AdminPageConfigController } from './admin-page-config.controller';
import { AdminPageConfigService } from './admin-page-config.service';

@Module({
    imports: [DatabaseModule, RedisModule, AuthModule],
    controllers: [AdminPageConfigController],
    providers: [AdminPageConfigService, PrismaService, AdminGuard],
    exports: [AdminPageConfigService],
})
export class AdminPageConfigModule {}
