import { Module } from '@nestjs/common';
import { AdminGuard, AuthModule } from '@examio/common';

import { AdminLogsController } from './admin-logs.controller';
import { AdminLogsService } from './admin-logs.service';
import { RedisLogService } from './redis-log.service';

@Module({
    imports: [AuthModule],
    controllers: [AdminLogsController],
    providers: [AdminLogsService, RedisLogService, AdminGuard],
    exports: [RedisLogService, AdminLogsService],
})
export class AdminLogsModule {}
