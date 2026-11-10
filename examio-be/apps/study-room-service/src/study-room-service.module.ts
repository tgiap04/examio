import { Module } from '@nestjs/common';
import { AuthJwtModule } from '@examio/auth-jwt';
import { MessagingModule } from '@examio/messaging';
import { HealthModule, LoggerModule } from '@examio/observability';
import { RedisModule, RedisReadinessCheck } from '@examio/redis';
import { PrismaModule, PrismaReadinessCheck, PrismaService } from './prisma';
import { StudyRoomModule } from './modules/study-room/study-room.module';
import { UserProfileModule } from './user-profile/user-profile.module';

@Module({
    imports: [
        LoggerModule.forRoot('study-room-service'),
        HealthModule.forRoot({
            checks: [PrismaReadinessCheck, RedisReadinessCheck],
        }),
        PrismaModule,
        RedisModule,
        // Audience `studyroom`; the service token is used for auth's GetPublicProfilesByIds.
        AuthJwtModule.forRoot({ serviceName: 'studyroom', serviceClient: true }),
        // One consumer for `studyroom.events`: `auth.user.authz_changed` (disconnect
        // stale sockets) and `auth.user.updated` (profile cache DEL). Handlers are
        // discovered across the whole app; they need the Socket.io server, so the
        // consumer lives in the API process (no separate worker container).
        MessagingModule.forRoot({
            service: 'studyroom',
            consume: { db: PrismaService },
        }),
        UserProfileModule,
        StudyRoomModule,
    ],
})
export class StudyRoomServiceModule {}
