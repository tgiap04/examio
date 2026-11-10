import { Module } from '@nestjs/common';
import { AuthJwtModule } from '@kmaedu/auth-jwt';
import { GrpcClientModule } from '@kmaedu/grpc';
import { MessagingModule, R2DeleteWorkerModule } from '@kmaedu/messaging';
import { LoggerModule } from '@kmaedu/observability';
import { R2_GRPC_REGISTRATION, R2Client } from './clients/r2.client';
import { R2DeleteObjectsSender } from './clients/r2-delete.sender';
import { DocumentEventsHandler } from './modules/events/document-events.handler';
import { DocumentDomainModule } from './modules/upload/document-domain.module';
import { PrismaModule, PrismaService } from './prisma';

/**
 * Worker-role module (`ROLE=worker`): relays the document outbox, consumes `document.events`
 * (`ai.document.processed|failed`) and drains
 * `r2_delete_tasks` through its own small pg pool, deleting through r2-service as `svc:document`.
 * No HTTP/gRPC listener.
 */
@Module({
    imports: [
        LoggerModule.forRoot('document-service'),
        PrismaModule,
        AuthJwtModule.forRoot({ serviceName: 'document', globalGuards: false, serviceClient: true }),
        MessagingModule.forRoot({ service: 'document', relay: true, consume: { db: PrismaService } }),
        R2DeleteWorkerModule.forRoot({
            imports: [GrpcClientModule.register(R2_GRPC_REGISTRATION)],
            providers: [R2Client],
            sender: R2DeleteObjectsSender,
        }),
        DocumentDomainModule,
    ],
    providers: [DocumentEventsHandler],
})
export class WorkerModule {}
