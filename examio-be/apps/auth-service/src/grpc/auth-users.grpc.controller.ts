import { Controller } from '@nestjs/common';
import { Metadata, status } from '@grpc/grpc-js';
import { authUsersV1 } from '@examio/contracts';
import { RequirePermissions, principalOfMetadata } from '@examio/auth-jwt';
import { PrismaService } from '../prisma';
import { UserUpdateWriter } from '../users-admin/user-update.writer';
import { UserStatsService } from '../users-admin/user-stats.service';
import { fail } from './auth.grpc.errors';
import { USER_SELECT, toUser } from './auth.grpc.mapper';
import { UsersQueryService } from './users-query.service';

const NAME_MAX = 100;
const BIO_MAX = 500;

/**
 * User operations other services used to run as SQL (phase 10). The actor of
 * a write is the verified token `sub` (forwarded admin token), never a field.
 */
@Controller()
@authUsersV1.AuthUserServiceControllerMethods()
export class AuthUsersGrpcController implements authUsersV1.AuthUserServiceController {
    constructor(
        private readonly users: UsersQueryService,
        private readonly writer: UserUpdateWriter,
        private readonly stats: UserStatsService,
        private readonly prisma: PrismaService
    ) {}

    @RequirePermissions('user:manage')
    async updateUserAdmin(
        data: authUsersV1.UpdateUserAdminRequest,
        metadata: Metadata
    ): Promise<authUsersV1.UpdateUserAdminResponse> {
        if (!data.userId) fail(status.INVALID_ARGUMENT, 'user_id is required');
        const name = data.name?.trim();
        if (data.name !== undefined && (!name || name.length > NAME_MAX)) {
            fail(status.INVALID_ARGUMENT, `name must be 1..${NAME_MAX} characters`);
        }
        if (data.bio !== undefined && data.bio.length > BIO_MAX) {
            fail(status.INVALID_ARGUMENT, `bio must be at most ${BIO_MAX} characters`);
        }
        if (data.name === undefined && data.bio === undefined && data.isVerified === undefined) {
            fail(status.INVALID_ARGUMENT, 'no fields to update');
        }
        const principal = principalOfMetadata(metadata);
        if (principal?.kind !== 'user') return fail(status.PERMISSION_DENIED, 'PERMISSION_DENIED');

        const result = await this.writer.update(
            data.userId,
            { name, bio: data.bio, isVerified: data.isVerified },
            principal.id
        );
        if (!result) return fail(status.NOT_FOUND, 'User not found');
        const row = await this.prisma.user.findUniqueOrThrow({
            where: { id: data.userId },
            select: USER_SELECT,
        });
        return { user: toUser(row) };
    }

    @RequirePermissions('user:search')
    async searchUsers(
        data: authUsersV1.SearchUsersRequest,
        metadata: Metadata
    ): Promise<authUsersV1.SearchUsersResponse> {
        const principal = principalOfMetadata(metadata);
        const actor = principal?.kind === 'user' ? principal.id : undefined;
        return { profiles: await this.users.searchUsers(data, actor) };
    }

    @RequirePermissions('stats:read')
    getUserStats(
        data: authUsersV1.GetUserStatsRequest
    ): Promise<authUsersV1.GetUserStatsResponse> {
        return this.stats.getStats(data);
    }

    @RequirePermissions('user:manage')
    async getUserAdminDetail(
        data: authUsersV1.GetUserAdminDetailRequest
    ): Promise<authUsersV1.GetUserAdminDetailResponse> {
        if (!data.userId) fail(status.INVALID_ARGUMENT, 'user_id is required');
        return this.users.getAdminDetail(data.userId);
    }
}
