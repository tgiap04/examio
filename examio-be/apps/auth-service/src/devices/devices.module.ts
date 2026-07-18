import { Module } from '@nestjs/common';
import { PrismaService } from '@examio/database';
import { AuthModule, RefreshTokenCipherService } from '@examio/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { UserSessionRepository } from './repositories/user-session.repository';
import { SessionCleanupCron } from './session-cleanup.cron';

@Module({
    imports: [AuthModule],
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
