import { Module } from '@nestjs/common';
import { AuthJwtModule } from '@examio/auth-jwt';
import { MessagingModule } from '@examio/messaging';
import { LoggerModule } from '@examio/observability';
import { RedisModule } from '@examio/redis';
import { ASSESSMENT_MESSAGING } from './messaging/assessment-messaging';
import { PrismaModule } from './prisma';

/**
 * Worker-role module (`ROLE=worker`): relays the assessment outbox and runs its daily purge. No
 * HTTP/gRPC listener. assessment owns no R2 objects and settles no money, so this is all it runs.
 */
@Module({
    imports: [
        LoggerModule.forRoot('assessment-service'),
        PrismaModule,
        RedisModule,
        AuthJwtModule.forRoot({ serviceName: 'assessment', globalGuards: false, serviceClient: true }),
        MessagingModule.forRoot({ ...ASSESSMENT_MESSAGING, relay: true }),
    ],
})
export class WorkerModule {}
