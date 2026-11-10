import { Module } from '@nestjs/common';
import { AuthJwtModule } from '@examio/auth-jwt';
import { GrpcClientModule } from '@examio/grpc';
import { MessagingModule, R2DeleteWorkerModule } from '@examio/messaging';
import { LoggerModule } from '@examio/observability';
import { RedisModule } from '@examio/redis';
import { R2_GRPC_REGISTRATION, R2Client } from './clients/r2.client';
import { R2DeleteObjectsSender } from './clients/r2-delete.sender';
import { CONTENT_MESSAGING } from './messaging/content-messaging';
import { GenerationModule } from './modules/ai/generation.module';
import { GenerationReaper } from './modules/ai/generation-reaper.service';
import { PrismaModule } from './prisma';

/**
 * Worker-role module (`ROLE=worker`): relays the content outbox (`content.generation.requested`,
 * `content.quizset.deleted`), settles generation jobs the API could not finish (stuck PENDING_CHARGE,
 * open refunds) and drains `r2_delete_tasks` (set thumbnails) through its own small pg pool, deleting
 * through r2-service as `svc:content`. No HTTP/gRPC listener. Nothing here calls document-service
 * (service tokens are refused there).
 */
@Module({
    imports: [
        LoggerModule.forRoot('content-service'),
        PrismaModule,
        RedisModule,
        AuthJwtModule.forRoot({ serviceName: 'content', globalGuards: false, serviceClient: true }),
        MessagingModule.forRoot({ ...CONTENT_MESSAGING, relay: true }),
        GenerationModule,
        R2DeleteWorkerModule.forRoot({
            imports: [GrpcClientModule.register(R2_GRPC_REGISTRATION)],
            providers: [R2Client],
            sender: R2DeleteObjectsSender,
        }),
    ],
    providers: [GenerationReaper],
})
export class WorkerModule {}
