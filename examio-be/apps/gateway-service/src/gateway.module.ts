import { Module } from '@nestjs/common';
import { AuthJwtModule, type TokenVerifier } from '@examio/auth-jwt';
import { MessagingModule } from '@examio/messaging';
import { RedisModule, RedisReadinessCheck } from '@examio/redis';
import { HealthModule, LoggerModule } from '@examio/observability';

import { GatewayController } from './gateway.controller';
import { ConfigController } from './controllers/config.controller';
import { GatewayControlGrpcController } from './control/gateway-control.grpc.controller';
import { AuthzChangedHandler } from './events/authz-changed.handler';
import { SessionRevokedHandler } from './events/session-revoked.handler';
import { GATEWAY_NO_DB, GatewayNoDbModule } from './gateway-no-db.module';
import { LogPublisherService } from './common/log-publisher.service';
import { AuthStateService } from './pipeline/auth-state.service';
import { EDGE_VERIFIER, createEdgeVerifier } from './pipeline/edge-verifier';
import { GatewayRedis } from './pipeline/gateway-redis';
import { GuardChain } from './pipeline/guard-chain';
import { PageFlagCheck } from './pipeline/page-flag.check';
import { RateLimiterService } from './pipeline/rate-limiter.service';
import { RequestLog } from './pipeline/request-log';
import { RouteTable, loadRouteTable } from './routing/route-table';
import { ConfigService } from './services/config.service';

/**
 * The gateway is a router, not a service: no Prisma, no outbound HTTP client.
 * Requests are handled by the dispatcher middleware (`app-setup.ts`); Nest
 * serves only `/health/*`, `/api/v1/{status,config/*}` and the GatewayControl
 * gRPC server. Global guards are on: `@ServiceOnly` protects the RPCs.
 */
@Module({
    imports: [
        LoggerModule.forRoot('gateway-service'),
        HealthModule.forRoot({ checks: [RedisReadinessCheck] }),
        AuthJwtModule.forRoot({ serviceName: 'gateway' }),
        RedisModule,
        GatewayNoDbModule,
        MessagingModule.forRoot({ service: 'gateway', consume: { db: GATEWAY_NO_DB } }),
    ],
    controllers: [GatewayController, ConfigController, GatewayControlGrpcController],
    providers: [
        ConfigService,
        LogPublisherService,
        RequestLog,
        GatewayRedis,
        PageFlagCheck,
        AuthzChangedHandler,
        SessionRevokedHandler,
        { provide: RouteTable, useFactory: () => loadRouteTable() },
        { provide: EDGE_VERIFIER, useFactory: createEdgeVerifier },
        {
            provide: AuthStateService,
            useFactory: (redis: GatewayRedis) =>
                new AuthStateService(redis, {
                    timeoutMs: Number(process.env.AUTH_STATE_TIMEOUT_MS) || undefined,
                }),
            inject: [GatewayRedis],
        },
        {
            provide: RateLimiterService,
            useFactory: (redis: GatewayRedis) => new RateLimiterService(redis),
            inject: [GatewayRedis],
        },
        {
            provide: GuardChain,
            useFactory: (
                table: RouteTable,
                verify: TokenVerifier,
                state: AuthStateService,
                limiter: RateLimiterService,
                pages: PageFlagCheck
            ) => new GuardChain({ table, verify, state, limiter, pages }),
            inject: [RouteTable, EDGE_VERIFIER, AuthStateService, RateLimiterService, PageFlagCheck],
        },
    ],
})
export class GatewayModule {}
