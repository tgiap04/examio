import { Module } from '@nestjs/common';
import { AuthJwtModule } from '@kmaedu/auth-jwt';
import { GrpcClientModule } from '@kmaedu/grpc';
import { MessagingModule, R2DeleteWorkerModule } from '@kmaedu/messaging';
import { LoggerModule } from '@kmaedu/observability';
import { R2_GRPC_REGISTRATION, R2Client } from './clients/r2.client';
import { R2DeleteObjectsSender } from './clients/r2-delete.sender';
import { LocalServiceTokenSource } from './token/local-service-token.source';
import { TokenModule } from './token/token.module';
import { TokenService } from './token/token.service';

/**
 * Worker-role module (`ROLE=worker`): runs the outbox relay and the daily purge,
 * and drains `r2_delete_tasks`. Both talk to Postgres through their own small pg
 * pools, so no Prisma client is needed and API request handling is never starved.
 * R2 deletes go out as `svc:auth` (a locally signed service token).
 */
@Module({
    imports: [
        LoggerModule.forRoot('auth-service'),
        MessagingModule.forRoot({ service: 'auth', relay: true }),
        AuthJwtModule.forRoot({
            serviceName: 'auth',
            globalGuards: false,
            verifier: {
                imports: [TokenModule],
                inject: [TokenService],
                useFactory: (tokens: TokenService) => tokens.verify,
            },
            serviceClient: {
                source: {
                    imports: [TokenModule],
                    inject: [TokenService],
                    useFactory: (tokens: TokenService) => new LocalServiceTokenSource(tokens),
                },
            },
        }),
        R2DeleteWorkerModule.forRoot({
            imports: [GrpcClientModule.register(R2_GRPC_REGISTRATION)],
            providers: [R2Client],
            sender: R2DeleteObjectsSender,
        }),
    ],
})
export class WorkerModule {}
