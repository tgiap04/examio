import { Module } from '@nestjs/common';
import { AuthServiceController } from './auth-service.controller';
import { AuthServiceService } from './auth-service.service';
import { AuthGrpcController } from './grpc/auth.grpc.controller';
import { UsersQueryService } from './grpc/users-query.service';
import { DatabaseModule, DatabaseReadinessCheck } from '@examio/database';
import { RedisReadinessCheck } from '@examio/redis';
import { HealthModule, LoggerModule } from '@examio/observability';
import { AuthJwtModule } from '@examio/auth-jwt';
import { AuthModule } from './auth.module';
import { AdminBootstrapModule } from './admin-bootstrap/admin-bootstrap.module';
import { RolesModule } from './roles/roles.module';
import { TokenModule } from './token/token.module';
import { TokenService } from './token/token.service';
import { LocalServiceTokenSource } from './token/local-service-token.source';

@Module({
    imports: [
        LoggerModule.forRoot('auth-service'),
        HealthModule.forRoot({
            checks: [DatabaseReadinessCheck, RedisReadinessCheck],
        }),
        DatabaseModule,
        AuthModule,
        RolesModule,
        AdminBootstrapModule.forRoot({ syncOnBoot: true }),
        // Auth verifies against its own keys (never its own JWKS over HTTP) and
        // signs its own outbound service tokens locally.
        AuthJwtModule.forRoot({
            serviceName: 'auth',
            verifier: {
                imports: [TokenModule],
                inject: [TokenService],
                useFactory: (tokens: TokenService) => tokens.verify,
            },
            serviceClient: {
                source: {
                    imports: [TokenModule],
                    inject: [TokenService],
                    useFactory: (tokens: TokenService) =>
                        new LocalServiceTokenSource(tokens),
                },
            },
        }),
    ],
    controllers: [AuthServiceController, AuthGrpcController],
    providers: [AuthServiceService, UsersQueryService],
})
export class AuthServiceModule {}
