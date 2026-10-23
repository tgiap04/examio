import { Module } from '@nestjs/common';
import { AuthJwtModule } from '@examio/auth-jwt';
import { GrpcClientModule } from '@examio/grpc';
import { R2DeleteWorkerModule } from '@examio/messaging';
import { LoggerModule } from '@examio/observability';
import { R2_GRPC_REGISTRATION, R2Client } from './clients/r2.client';
import { R2DeleteObjectsSender } from './clients/r2-delete.sender';

/**
 * Worker-role module (`ROLE=worker`): drains `r2_delete_tasks` through its own
 * small pg pool (no Prisma client) and deletes the objects through r2-service
 * as `svc:vocabulary`. No HTTP/gRPC listener.
 */
@Module({
    imports: [
        LoggerModule.forRoot('vocabulary-service'),
        AuthJwtModule.forRoot({
            serviceName: 'vocabulary',
            globalGuards: false,
            serviceClient: true,
        }),
        R2DeleteWorkerModule.forRoot({
            imports: [GrpcClientModule.register(R2_GRPC_REGISTRATION)],
            providers: [R2Client],
            sender: R2DeleteObjectsSender,
        }),
    ],
})
export class WorkerModule {}
