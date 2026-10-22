import { Global, Module } from '@nestjs/common';
import { GrpcClientModule } from '@examio/grpc';
import { AUTH_GRPC_REGISTRATION, AuthClient } from '../../clients/auth.client';
import { UserEnricher } from './user-enricher.service';
import { UserUpdatedHandler } from './user-updated.handler';

/**
 * exam's only window onto user data: batched public profiles from auth (cached),
 * post-query enrichment, and cache invalidation on `auth.user.updated`. The
 * handler is found by the messaging consumer registered in StudyRoomModule.
 */
@Global()
@Module({
    imports: [GrpcClientModule.register(AUTH_GRPC_REGISTRATION)],
    providers: [AuthClient, UserEnricher, UserUpdatedHandler],
    exports: [AuthClient, UserEnricher],
})
export class UserProfileModule {}
