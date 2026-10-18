import { Injectable } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@examio/database';
import { authV1 } from '@examio/contracts';
import { fail } from './auth.grpc.errors';
import {
    PUBLIC_PROFILE_SELECT,
    USER_SELECT,
    fromProtoRole,
    toProtoRole,
    toPublicProfile,
    toUser,
} from './auth.grpc.mapper';

const MAX_BATCH = 500;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

/** Read side of the auth gRPC surface. Every lookup is one batched query (no N+1). */
@Injectable()
export class UsersQueryService {
    constructor(private readonly prisma: PrismaService) {}

    async getUser(userId: string): Promise<authV1.User> {
        if (!userId) fail(status.INVALID_ARGUMENT, 'user_id is required');
        const row = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { ...USER_SELECT, deletedAt: true },
        });
        if (!row || row.deletedAt) fail(status.NOT_FOUND, 'User not found');
        return toUser(row!);
    }

    async findByEmail(rawEmail: string): Promise<authV1.User> {
        const email = rawEmail?.trim().toLowerCase();
        if (!email) fail(status.INVALID_ARGUMENT, 'email is required');
        const row = await this.prisma.user.findUnique({
            where: { email },
            select: { ...USER_SELECT, deletedAt: true },
        });
        if (!row || row.deletedAt) fail(status.NOT_FOUND, 'User not found');
        return toUser(row!);
    }

    /** Result keeps the caller's order; unknown ids are omitted. */
    async getUsersByIds(userIds: string[]): Promise<authV1.User[]> {
        const ids = this.uniqueIds(userIds);
        if (!ids.length) return [];
        const rows = await this.prisma.user.findMany({
            where: { id: { in: ids }, deletedAt: null },
            select: USER_SELECT,
        });
        const byId = new Map(rows.map((r) => [r.id, r]));
        return ids.flatMap((id) => (byId.has(id) ? [toUser(byId.get(id)!)] : []));
    }

    /** id, username, name, avatar only: never an email. */
    async getPublicProfiles(userIds: string[]): Promise<authV1.PublicProfile[]> {
        const ids = this.uniqueIds(userIds);
        if (!ids.length) return [];
        const rows = await this.prisma.user.findMany({
            where: { id: { in: ids }, deletedAt: null },
            select: PUBLIC_PROFILE_SELECT,
        });
        const byId = new Map(rows.map((r) => [r.id, r]));
        return ids.flatMap((id) => (byId.has(id) ? [toPublicProfile(byId.get(id)!)] : []));
    }

    async listUsers(data: authV1.ListUsersRequest): Promise<authV1.ListUsersResponse> {
        const page = Math.max(1, data.page || 1);
        const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, data.limit || DEFAULT_PAGE_SIZE));
        const role = data.role === undefined ? undefined : fromProtoRole(data.role);
        const query = data.query?.trim();

        const where: Prisma.UserWhereInput = {
            deletedAt: null,
            ...(role && { role }),
            ...(data.isSystemAdmin !== undefined && { isSystemAdmin: data.isSystemAdmin }),
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

    async listRoleChanges(
        data: authV1.ListRoleChangesRequest
    ): Promise<authV1.ListRoleChangesResponse> {
        const page = Math.max(1, data.page || 1);
        const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, data.limit || DEFAULT_PAGE_SIZE));
        const where: Prisma.RoleChangeLogWhereInput = data.targetUserId
            ? { targetUserId: data.targetUserId }
            : {};
        const [rows, total] = await this.prisma.$transaction([
            this.prisma.roleChangeLog.findMany({
                where,
                orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.roleChangeLog.count({ where }),
        ]);
        return {
            changes: rows.map((r) => ({
                id: r.id,
                targetUserId: r.targetUserId,
                changedBy: r.actorUserId ?? r.actorEmail,
                fromRole: toProtoRole(r.fromRole),
                toRole: toProtoRole(r.toRole),
                fromIsSystemAdmin: r.fromAdmin,
                toIsSystemAdmin: r.toAdmin,
                reason: r.reason ?? '',
                createdAt: String(r.createdAt.getTime()),
            })),
            page: { total, page, limit },
        };
    }

    private uniqueIds(userIds: string[]): string[] {
        const ids = [...new Set(userIds)];
        if (ids.length > MAX_BATCH) {
            fail(status.INVALID_ARGUMENT, `At most ${MAX_BATCH} ids per call`);
        }
        return ids;
    }
}
