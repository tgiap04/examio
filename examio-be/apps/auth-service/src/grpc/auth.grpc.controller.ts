import { Controller } from '@nestjs/common';
import { Metadata, status } from '@grpc/grpc-js';
import { authV1 } from '@examio/contracts';
import {
    RequirePermissions,
    RequirePermissionsOrService,
    principalOfMetadata,
} from '@examio/auth-jwt';
import { RoleChangeService } from '../roles/role-change.service';
import { fail, toRpcError } from './auth.grpc.errors';
import { USER_SELECT, fromProtoRole, toUser } from './auth.grpc.mapper';
import { UsersQueryService } from './users-query.service';
import { UserStatusService } from '../user-status/user-status.service';
import { PrismaService } from '../prisma';

/**
 * Auth gRPC surface. Every handler carries a guard declaration (a unit test
 * scans for it): the actor of a write is always the verified token `sub`
 * (forwarded user token), never a request field.
 */
@Controller()
@authV1.AuthServiceControllerMethods()
export class AuthGrpcController implements authV1.AuthServiceController {
    constructor(
        private readonly users: UsersQueryService,
        private readonly roles: RoleChangeService,
        private readonly userStatus: UserStatusService,
        private readonly prisma: PrismaService
    ) {}

    @RequirePermissionsOrService([])
    async getPublicProfilesByIds(
        data: authV1.GetPublicProfilesByIdsRequest
    ): Promise<authV1.GetPublicProfilesByIdsResponse> {
        return { profiles: await this.users.getPublicProfiles(data.userIds) };
    }

    @RequirePermissionsOrService(['user:manage'], { callers: ['admin'] })
    async getUser(data: authV1.GetUserRequest): Promise<authV1.GetUserResponse> {
        return { user: await this.users.getUser(data.userId) };
    }

    // Returns emails: admin only (service token + user:manage), never other services.
    @RequirePermissionsOrService(['user:manage'], { callers: ['admin'] })
    async getUsersByIds(
        data: authV1.GetUsersByIdsRequest
    ): Promise<authV1.GetUsersByIdsResponse> {
        return { users: await this.users.getUsersByIds(data.userIds) };
    }

    @RequirePermissionsOrService(['user:manage'], { callers: ['admin'] })
    async findUserByEmail(
        data: authV1.FindUserByEmailRequest
    ): Promise<authV1.FindUserByEmailResponse> {
        return { user: await this.users.findByEmail(data.email) };
    }

    // User token only (admin role screen forwards the admin's token); service tokens are refused.
    @RequirePermissions('user:manage')
    listUsers(data: authV1.ListUsersRequest): Promise<authV1.ListUsersResponse> {
        return this.users.listUsers(data);
    }

    @RequirePermissions('role:assign')
    async setUserRole(
        data: authV1.SetUserRoleRequest,
        metadata: Metadata
    ): Promise<authV1.SetUserRoleResponse> {
        const role = fromProtoRole(data.role);
        if (!role) fail(status.INVALID_ARGUMENT, 'role must be STUDENT or TEACHER');
        return this.applyChange(metadata, data.userId, { role }, data.reason);
    }

    @RequirePermissions('role:assign')
    async setSystemAdmin(
        data: authV1.SetSystemAdminRequest,
        metadata: Metadata
    ): Promise<authV1.SetSystemAdminResponse> {
        return this.applyChange(
            metadata,
            data.userId,
            { isSystemAdmin: data.isSystemAdmin },
            data.reason
        );
    }

    @RequirePermissions('role:assign')
    async setUserStatus(
        data: authV1.SetUserStatusRequest,
        metadata: Metadata
    ): Promise<authV1.SetUserStatusResponse> {
        if (!data.userId) fail(status.INVALID_ARGUMENT, 'user_id is required');
        const principal = principalOfMetadata(metadata);
        if (principal?.kind !== 'user') {
            return fail(status.PERMISSION_DENIED, 'PERMISSION_DENIED');
        }
        try {
            await this.userStatus.setStatus({
                actorUserId: principal.id,
                targetUserId: data.userId,
                isBanned: data.isBanned,
                reason: data.reason?.trim() || undefined,
            });
        } catch (err) {
            return toRpcError(err);
        }
        return this.readUser(data.userId);
    }

    @RequirePermissions('role:assign')
    listRoleChanges(
        data: authV1.ListRoleChangesRequest
    ): Promise<authV1.ListRoleChangesResponse> {
        return this.users.listRoleChanges(data);
    }

    private async applyChange(
        metadata: Metadata,
        targetUserId: string,
        change: { role?: 'STUDENT' | 'TEACHER'; isSystemAdmin?: boolean },
        reason: string
    ): Promise<{ user: authV1.User }> {
        if (!targetUserId) fail(status.INVALID_ARGUMENT, 'user_id is required');
        const principal = principalOfMetadata(metadata);
        if (principal?.kind !== 'user') {
            return fail(status.PERMISSION_DENIED, 'PERMISSION_DENIED');
        }
        try {
            await this.roles.change({
                actor: { kind: 'user', userId: principal.id },
                targetUserId,
                ...change,
                reason: reason?.trim() || undefined,
                source: 'admin-ui',
            });
        } catch (err) {
            return toRpcError(err);
        }
        return this.readUser(targetUserId);
    }

    private async readUser(id: string): Promise<{ user: authV1.User }> {
        const row = await this.prisma.user.findUniqueOrThrow({
            where: { id },
            select: USER_SELECT,
        });
        return { user: toUser(row) };
    }
}
