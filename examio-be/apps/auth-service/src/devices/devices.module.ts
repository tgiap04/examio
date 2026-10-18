import { Module } from '@nestjs/common';
import { PrismaService } from '@examio/database';
import { RefreshTokenCipherService } from '@examio/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { UserSessionRepository } from './repositories/user-session.repository';
import { SessionCleanupCron } from './session-cleanup.cron';

@Module({
    controllers: [DevicesController],
    providers: [
        DevicesService,
        PrismaService,
        RefreshTokenCipherService,
        UserSessionRepository,
        SessionCleanupCron,
    ],
    exports: [DevicesService, UserSessionRepository],
})
export class DevicesModule {}
