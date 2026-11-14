import { Injectable } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { PROTO_FILES, authUsersV1 } from '@kmaedu/contracts';
import {
    PublicProfileClient,
    PublicUser,
    invokeRpc,
    toPublicUser,
} from '@kmaedu/grpc';

// Shared lookup types/registration come from @kmaedu/grpc; re-exported so the
// assessment modules keep importing them from here.
export { AUTH_GRPC, AUTH_GRPC_REGISTRATION } from '@kmaedu/grpc';
export type { ProfileLookupOptions, PublicUser } from '@kmaedu/grpc';

export const ASSESSMENT_PROFILE_CACHE_PREFIX = 'assessment:cache:user:';

const AUTH_USERS = `${PROTO_FILES.authUsers.pkg}.${authUsersV1.AUTH_USER_SERVICE_NAME}`;

/**
 * assessment -> auth. Public-profile lookup + cache are inherited from
 * `PublicProfileClient` (prefix `assessment:cache:user:`, bound in UserProfileModule via
 * `publicProfileConfigProviders`; no constructor of its own, so the parent's
 * injection tokens apply); assessment also searches users.
 */
@Injectable()
export class AuthClient extends PublicProfileClient {
    private users!: authUsersV1.AuthUserServiceClient;

    override onModuleInit(): void {
        super.onModuleInit();
        this.users = this.client.getService<authUsersV1.AuthUserServiceClient>(
            authUsersV1.AUTH_USER_SERVICE_NAME
        );
    }

    /** Display-safe search (no email); server caps at 20. */
    async searchUsers(
        query: string,
        limit: number,
        metadata: Metadata
    ): Promise<PublicUser[]> {
        const md = await this.attacher.attach(metadata, 'auth');
        const res = await invokeRpc(`${AUTH_USERS}/SearchUsers`, (o) =>
            this.users.searchUsers({ query, limit }, md, o)
        );
        return res.profiles.map(toPublicUser);
    }
}
