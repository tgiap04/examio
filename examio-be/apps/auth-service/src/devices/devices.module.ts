import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { RefreshTokenCipherService } from '@examio/common';
import { MessagingModule } from '@examio/messaging';
import { RolesModule } from '../roles/roles.module';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { UserSessionRepository } from './repositories/user-session.repository';
import { SessionCleanupCron } from './session-cleanup.cron';
import { SessionRevoker } from './session-revoker.service';
import { SessionRevokedPublisher } from './session-revoked.publisher';

@Module({
    imports: [RolesModule, MessagingModule.forRoot({ service: 'auth' })],
    controllers: [DevicesController],
    providers: [
        DevicesService,
        PrismaService,
        RefreshTokenCipherService,
        UserSessionRepository,
        SessionCleanupCron,
        SessionRevoker,
        SessionRevokedPublisher,
    ],
    exports: [DevicesService, UserSessionRepository, SessionRevoker],
})
export class DevicesModule {}
