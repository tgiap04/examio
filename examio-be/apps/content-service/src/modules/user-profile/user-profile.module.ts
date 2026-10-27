import { Global, Module } from '@nestjs/common';
import { GrpcClientModule, publicProfileConfigProviders } from '@examio/grpc';
import { ServiceMetadata } from '@examio/auth-jwt';
import { RedisService } from '@examio/redis';
import { MessagingModule } from '@examio/messaging';
import { CONTENT_MESSAGING } from '../../messaging/content-messaging';
import { PrismaService } from '../../prisma';
import {
    AUTH_GRPC_REGISTRATION,
    AuthClient,
    CONTENT_PROFILE_CACHE_PREFIX,
} from '../../clients/auth.client';
import { UserEnricher } from './user-enricher.service';
import { UserUpdatedHandler } from './user-updated.handler';

/**
 * content's only window onto user data: batched public profiles from auth (cached),
 * post-query enrichment, and cache invalidation on `auth.user.updated`.
 * `auth.user.authz_changed` is no longer bound here: only study-room-service
 * (the WebSocket owner) reacts to it.
 */
@Global()
@Module({
    imports: [
        GrpcClientModule.register(AUTH_GRPC_REGISTRATION),
        // Consumes content.events: the binding set is whatever @EventHandler exists (auth.user.updated).
        MessagingModule.forRoot({ ...CONTENT_MESSAGING, consume: { db: PrismaService } }),
    ],
    providers: [
        ...publicProfileConfigProviders({
            cachePrefix: CONTENT_PROFILE_CACHE_PREFIX,
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
