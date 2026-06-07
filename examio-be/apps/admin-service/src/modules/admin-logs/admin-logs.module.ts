import { Module } from '@nestjs/common';
import { AdminLogsController } from './admin-logs.controller';
import { AdminLogsService } from './admin-logs.service';
import { RedisLogService } from './redis-log.service';

@Module({
    controllers: [AdminLogsController],
    providers: [AdminLogsService, RedisLogService],
    exports: [RedisLogService, AdminLogsService],
})
export class AdminLogsModule {}
