import { Global, Module } from '@nestjs/common';
import { GrpcClientModule, publicProfileConfigProviders } from '@kmaedu/grpc';
import { ServiceMetadata } from '@kmaedu/auth-jwt';
import { RedisService } from '@kmaedu/redis';
import { MessagingModule } from '@kmaedu/messaging';
import { ASSESSMENT_MESSAGING } from '../../messaging/assessment-messaging';
import { PrismaService } from '../../prisma';
import {
    AUTH_GRPC_REGISTRATION,
    AuthClient,
    ASSESSMENT_PROFILE_CACHE_PREFIX,
} from '../../clients/auth.client';
import { UserEnricher } from './user-enricher.service';
import { UserUpdatedHandler } from './user-updated.handler';

/**
 * assessment's only window onto user data: batched public profiles from auth (cached),
 * post-query enrichment, and cache invalidation on `auth.user.updated`.
 * `auth.user.authz_changed` is no longer bound here: only study-room-service
 * (the WebSocket owner) reacts to it.
 */
@Global()
@Module({
    imports: [
        GrpcClientModule.register(AUTH_GRPC_REGISTRATION),
        // Consumes assessment.events: the binding set is whatever @EventHandler exists (auth.user.updated).
        MessagingModule.forRoot({ ...ASSESSMENT_MESSAGING, consume: { db: PrismaService } }),
    ],
    providers: [
        ...publicProfileConfigProviders({
            cachePrefix: ASSESSMENT_PROFILE_CACHE_PREFIX,
            redis: RedisService,
            attacher: ServiceMetadata,
        }),
        AuthClient,
        UserEnricher,
        UserUpdatedHandler,
    ],
    exports: [AuthClient, UserEnricher],
})
export class UserProfileModule {}
