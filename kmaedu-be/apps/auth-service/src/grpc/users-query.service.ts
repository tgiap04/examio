import { Injectable } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import type { Prisma } from '../prisma';
import { PrismaService } from '../prisma';
import { authUsersV1, authV1 } from '@kmaedu/contracts';
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
const SEARCH_MIN_LENGTH = 3;
const SEARCH_MAX_LIMIT = 20;

function encodeCursor(row: { createdAt: Date; id: string }): string {
    return Buffer.from(`${row.createdAt.getTime()}:${row.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
    const raw = Buffer.from(cursor, 'base64url').toString();
    const at = raw.indexOf(':');
    const ms = Number(raw.slice(0, at));
    const id = raw.slice(at + 1);
    if (at < 1 || !Number.isFinite(ms) || !id) fail(status.INVALID_ARGUMENT, 'invalid cursor');
    return { createdAt: new Date(ms), id };
}

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
        // `cursor` set (even '' for the first page) selects keyset paging.
        const keyset = data.cursor !== undefined;
        const cursor = data.cursor ? decodeCursor(data.cursor) : null;

        const created: Prisma.DateTimeFilter = {};
        if (data.createdFrom !== undefined) created.gte = new Date(Number(data.createdFrom));
        if (data.createdTo !== undefined) created.lte = new Date(Number(data.createdTo));

        const filters: Prisma.UserWhereInput = {
            deletedAt: null,
            ...(role && { role }),
            ...(data.isSystemAdmin !== undefined && { isSystemAdmin: data.isSystemAdmin }),
            ...(data.isBanned !== undefined && { isBanned: data.isBanned }),
            ...(data.isVerified !== undefined && { isVerified: data.isVerified }),
            ...(Object.keys(created).length > 0 && { createdAt: created }),
            ...(query && {
                OR: [
                    { email: { contains: query, mode: 'insensitive' } },
                    { username: { contains: query, mode: 'insensitive' } },
                    { name: { contains: query, mode: 'insensitive' } },
                ],
            }),
        };
        // Keyset page: (createdAt desc, id asc) strictly after the cursor row.
        const where: Prisma.UserWhereInput = cursor
            ? {
                  AND: [
                      filters,
                      {
                          OR: [
                              { createdAt: { lt: cursor.createdAt } },
                              { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                          ],
                      },
                  ],
              }
            : filters;
        const [rows, total] = await this.prisma.$transaction([
            this.prisma.user.findMany({
                where,
                select: USER_SELECT,
                orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
                ...(keyset ? { take: limit + 1 } : { skip: (page - 1) * limit, take: limit }),
            }),
            this.prisma.user.count({ where: filters }),
        ]);
        const pageRows = keyset ? rows.slice(0, limit) : rows;
        const last = pageRows[pageRows.length - 1];
        return {
            users: pageRows.map(toUser),
            page: { total, page, limit },
            nextCursor: keyset && rows.length > limit && last ? encodeCursor(last) : undefined,
        };
    }

    /** Display-safe prefix search; never returns an email and excludes the caller. */
    async searchUsers(
        data: authUsersV1.SearchUsersRequest,
        actorUserId: string | undefined
    ): Promise<authV1.PublicProfile[]> {
        const q = data.query?.trim() ?? '';
        if (q.length < SEARCH_MIN_LENGTH) {
            fail(status.INVALID_ARGUMENT, `query must be at least ${SEARCH_MIN_LENGTH} characters`);
        }
        const take = Math.min(SEARCH_MAX_LIMIT, Math.max(1, data.limit || SEARCH_MAX_LIMIT));
        const rows = await this.prisma.user.findMany({
            where: {
                ...(actorUserId && { id: { not: actorUserId } }),
                deletedAt: null,
                OR: [
                    { username: { startsWith: q, mode: 'insensitive' } },
                    { name: { startsWith: q, mode: 'insensitive' } },
                    { email: { equals: q, mode: 'insensitive' } },
                ],
            },
            select: PUBLIC_PROFILE_SELECT,
            orderBy: { username: 'asc' },
            take,
        });
        return rows.map(toPublicProfile);
    }

    /** Account + latest session for the admin user detail (soft-deleted accounts are still shown, as before). */
    async getAdminDetail(userId: string): Promise<authUsersV1.GetUserAdminDetailResponse> {
        const row = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                ...USER_SELECT,
                sessions: {
                    orderBy: { lastActivity: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        deviceName: true,
                        browser: true,
                        os: true,
                        ipAddress: true,
                        country: true,
                        city: true,
                        lastActivity: true,
                        isActive: true,
                    },
                },
            },
        });
        if (!row) fail(status.NOT_FOUND, 'User not found');
        const { sessions, ...user } = row!;
        const s = sessions[0];
        return {
            user: toUser(user),
            lastSession: s && {
                id: s.id,
                deviceName: s.deviceName ?? undefined,
                browser: s.browser ?? undefined,
                os: s.os ?? undefined,
                ipAddress: s.ipAddress ?? undefined,
                country: s.country ?? undefined,
                city: s.city ?? undefined,
                lastActivity: String(s.lastActivity.getTime()),
                isActive: s.isActive,
            },
        };
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
                targetEmail: r.targetEmail,
                actorEmail: r.actorEmail,
                source: r.source,
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
