import { Global, Module } from '@nestjs/common';
import {
    AUTH_GRPC_REGISTRATION,
    GrpcClientModule,
    PublicProfileClient,
    UserEnricher,
    publicProfileConfigProviders,
} from '@examio/grpc';
import { ServiceMetadata } from '@examio/auth-jwt';
import { RedisService } from '@examio/redis';
import { UserUpdatedHandler } from './user-updated.handler';

/** Redis namespace of study-room (the service may only touch `studyroom:*`). */
export const STUDYROOM_PROFILE_CACHE_PREFIX = 'studyroom:cache:user:';

/**
 * study-room's only window onto user data: batched public profiles from auth
 * (cached under `studyroom:cache:user:`), post-query enrichment, and cache
 * invalidation on `auth.user.updated` (consumed by the MessagingModule of the
 * root module).
 */
@Global()
@Module({
    imports: [GrpcClientModule.register(AUTH_GRPC_REGISTRATION)],
    providers: [
        ...publicProfileConfigProviders({
            cachePrefix: STUDYROOM_PROFILE_CACHE_PREFIX,
            redis: RedisService,
            attacher: ServiceMetadata,
        }),
        PublicProfileClient,
        UserEnricher,
        UserUpdatedHandler,
    ],
    exports: [PublicProfileClient, UserEnricher],
})
export class UserProfileModule {}
