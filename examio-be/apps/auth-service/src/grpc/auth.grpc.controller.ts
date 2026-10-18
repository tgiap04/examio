import { Controller } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@examio/database';
import { authV1 } from '@examio/contracts';

const MAX_BATCH = 500;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

const USER_SELECT = {
    id: true,
    email: true,
    username: true,
    name: true,
    avatar: true,
    isAdmin: true,
    isVerified: true,
    isBanned: true,
    createdAt: true,
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

const fail = (code: status, message: string): never => {
    throw new RpcException({ code, message });
};

const unimplemented = (rpc: string): never =>
    fail(status.UNIMPLEMENTED, `${rpc} is not implemented yet`);

/** Until phase 04 stores roles, every user is a STUDENT and `isAdmin` is the system-admin flag. */
function toUser(row: UserRow): authV1.User {
    return {
        id: row.id,
        email: row.email,
        username: row.username,
        name: row.name ?? '',
        avatar: row.avatar ?? '',
        role: authV1.BaseRole.BASE_ROLE_STUDENT,
        isSystemAdmin: row.isAdmin,
        isVerified: row.isVerified,
        isBanned: row.isBanned,
        createdAt: String(row.createdAt.getTime()),
    };
}

@Controller()
@authV1.AuthServiceControllerMethods()
export class AuthGrpcController implements authV1.AuthServiceController {
    constructor(private readonly prisma: PrismaService) {}

    async getUser(data: authV1.GetUserRequest): Promise<authV1.GetUserResponse> {
        if (!data.userId) fail(status.INVALID_ARGUMENT, 'user_id is required');
        const row = await this.prisma.user.findUnique({
            where: { id: data.userId },
            select: { ...USER_SELECT, deletedAt: true },
        });
        if (!row || row.deletedAt) fail(status.NOT_FOUND, 'User not found');
        return { user: toUser(row as UserRow) };
    }

    async getUsersByIds(
        data: authV1.GetUsersByIdsRequest
    ): Promise<authV1.GetUsersByIdsResponse> {
        const ids = [...new Set(data.userIds)];
        if (ids.length > MAX_BATCH) {
            fail(status.INVALID_ARGUMENT, `At most ${MAX_BATCH} ids per call`);
        }
        if (!ids.length) return { users: [] };

        // One query, then restore the caller's order; unknown ids are omitted.
        const rows = await this.prisma.user.findMany({
            where: { id: { in: ids }, deletedAt: null },
            select: USER_SELECT,
        });
        const byId = new Map(rows.map((r) => [r.id, r]));
        return {
            users: ids.flatMap((id) => {
                const row = byId.get(id);
                return row ? [toUser(row)] : [];
            }),
        };
    }

    async findUserByEmail(
        data: authV1.FindUserByEmailRequest
    ): Promise<authV1.FindUserByEmailResponse> {
        const email = data.email?.trim().toLowerCase();
        if (!email) fail(status.INVALID_ARGUMENT, 'email is required');
        const row = await this.prisma.user.findUnique({
            where: { email },
            select: { ...USER_SELECT, deletedAt: true },
        });
        if (!row || row.deletedAt) fail(status.NOT_FOUND, 'User not found');
        return { user: toUser(row as UserRow) };
    }

    async listUsers(
        data: authV1.ListUsersRequest
    ): Promise<authV1.ListUsersResponse> {
        const page = Math.max(1, data.page || 1);
        const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, data.limit || DEFAULT_PAGE_SIZE));

        // Roles are stored from phase 04; until then nobody is a TEACHER.
        if (data.role === authV1.BaseRole.BASE_ROLE_TEACHER) {
            return { users: [], page: { total: 0, page, limit } };
        }

        const query = data.query?.trim();
        const where: Prisma.UserWhereInput = {
            deletedAt: null,
            ...(data.isSystemAdmin !== undefined && { isAdmin: data.isSystemAdmin }),
            ...(data.isBanned !== undefined && { isBanned: data.isBanned }),
            ...(query && {
                OR: [
                    { email: { contains: query, mode: 'insensitive' } },
                    { username: { contains: query, mode: 'insensitive' } },
                    { name: { contains: query, mode: 'insensitive' } },
                ],
            }),
        };
        const [rows, total] = await this.prisma.$transaction([
            this.prisma.user.findMany({
                where,
                select: USER_SELECT,
                orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.user.count({ where }),
        ]);
        return { users: rows.map(toUser), page: { total, page, limit } };
    }

    // Owned by later phases; the contract is fixed now so clients can compile.
    getPublicProfilesByIds(
        _data: authV1.GetPublicProfilesByIdsRequest
    ): Promise<authV1.GetPublicProfilesByIdsResponse> {
        return unimplemented('GetPublicProfilesByIds'); // phase 04
    }

    setUserRole(_data: authV1.SetUserRoleRequest): Promise<authV1.SetUserRoleResponse> {
        return unimplemented('SetUserRole'); // phase 04
    }

    setSystemAdmin(
        _data: authV1.SetSystemAdminRequest
    ): Promise<authV1.SetSystemAdminResponse> {
        return unimplemented('SetSystemAdmin'); // phase 04
    }

    setUserStatus(
        _data: authV1.SetUserStatusRequest
    ): Promise<authV1.SetUserStatusResponse> {
        return unimplemented('SetUserStatus'); // phase 08
    }

    listRoleChanges(
        _data: authV1.ListRoleChangesRequest
    ): Promise<authV1.ListRoleChangesResponse> {
        return unimplemented('ListRoleChanges'); // phase 04
    }
}
