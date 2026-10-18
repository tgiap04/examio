import { Module } from '@nestjs/common';
import { AuthServiceController } from './auth-service.controller';
import { AuthServiceService } from './auth-service.service';
import { AuthGrpcController } from './grpc/auth.grpc.controller';
import { DatabaseModule, DatabaseReadinessCheck } from '@examio/database';
import { RedisReadinessCheck } from '@examio/redis';
import { HealthModule, LoggerModule } from '@examio/observability';
import { AuthModule } from './auth.module';

@Module({
    imports: [
        LoggerModule.forRoot('auth-service'),
        HealthModule.forRoot({
            checks: [DatabaseReadinessCheck, RedisReadinessCheck],
        }),
        DatabaseModule,
        AuthModule,
    ],
    controllers: [AuthServiceController, AuthGrpcController],
    providers: [AuthServiceService],
})
export class AuthServiceModule {}
