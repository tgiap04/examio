import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@examio/database';

import { AuditWriterService } from '../../common/audit-writer.service';
import { ListUsersQuery } from './dto/list-users.query';
import { UpdateUserBody } from './dto/update-user.body';
import { userSelectSafe, UserSafeRow } from './user-select.safe';

export interface AuditContext {
    adminId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
}

export interface ListUsersResult {
    rows: UserSafeRow[];
    total: number;
    page: number;
    pageSize: number;
}

export interface UserDetail {
    user: UserSafeRow;
    wallet: { id: string; balance: number } | null;
    subscription: {
        id: string;
        tier: number;
        billingCycle: string;
        isActive: boolean;
    } | null;
    lastSession: {
        id: string;
        deviceName: string | null;
        browser: string | null;
        os: string | null;
        ipAddress: string | null;
        country: string | null;
        city: string | null;
        lastActivity: Date;
        isActive: boolean;
    } | null;
}

export interface UpdateUserResult {
    user: UserSafeRow;
    changedFields: string[];
}

const MUTABLE_FIELDS = ['isAdmin', 'isVerified', 'isBanned', 'name', 'bio'] as const;
type MutableField = (typeof MUTABLE_FIELDS)[number];

/**
 * AdminUsersService — admin-side CRUD over the `User` table.
 *
 * Every mutation:
 *  - runs inside prisma.$transaction with isolation = Serializable
 *  - writes one AdminAudit row per changed field via AuditWriter
 *  - explicitly excludes `password` from every select (`userSelectSafe`)
 *
 * Safety guards:
 *  - `revokeAdmin` blocks the request when the target is the caller
 *    (defends against self-lockout)
 *  - `banUser` is also blocked on self (defends against self-ban)
 */
@Injectable()
export class AdminUsersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auditWriter: AuditWriterService
    ) {}

    /**
     * Paginated list of users with optional filters. `search` matches
     * `email` or `username` via case-insensitive `contains`.
     */
    async listUsers(query: ListUsersQuery): Promise<ListUsersResult> {
        const where: Prisma.UserWhereInput = {};

        if (query.search) {
            where.OR = [
                { email: { contains: query.search, mode: 'insensitive' } },
                { username: { contains: query.search, mode: 'insensitive' } },
            ];
        }
        if (query.isAdmin !== undefined) {
            where.isAdmin = query.isAdmin;
        }
        if (query.isVerified !== undefined) {
            where.isVerified = query.isVerified;
        }
        if (query.isBanned !== undefined) {
            where.isBanned = query.isBanned;
        }
        if (query.createdFrom || query.createdTo) {
            where.createdAt = {};
            if (query.createdFrom) {
                where.createdAt.gte = new Date(query.createdFrom);
            }
            if (query.createdTo) {
                where.createdAt.lte = new Date(query.createdTo);
            }
        }

        const skip = (query.page - 1) * query.pageSize;

        const [rows, total] = await this.prisma.$transaction([
            this.prisma.user.findMany({
                where,
                select: userSelectSafe,
                orderBy: { createdAt: 'desc' },
                skip,
                take: query.pageSize,
            }),
            this.prisma.user.count({ where }),
        ]);

        return {
            rows,
            total,
            page: query.page,
            pageSize: query.pageSize,
        };
    }

    /**
     * Full user profile + wallet + subscription + last session.
     * Throws 404 when the user does not exist. Never returns `password`.
     */
    async getUserDetail(id: string): Promise<UserDetail> {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: {
                ...userSelectSafe,
                wallet: {
                    select: { id: true, balance: true },
                },
                subscription: {
                    select: {
                        id: true,
                        tier: true,
                        billingCycle: true,
                        isActive: true,
                    },
                },
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

        if (!user) {
            throw new NotFoundException('User not found');
        }

        const { wallet, subscription, sessions, ...rest } = user;

        return {
            user: rest,
            wallet: wallet
                ? { id: wallet.id, balance: wallet.balance }
                : null,
            subscription: subscription
                ? {
                      id: subscription.id,
                      tier: subscription.tier,
                      billingCycle: subscription.billingCycle,
                      isActive: subscription.isActive,
                  }
                : null,
            lastSession: sessions[0] ?? null,
        };
    }

    /**
     * Patch a user. Diffs incoming body against the persisted record
     * and writes one audit row per changed field with
     * payload `{ field, from, to }`.
     */
    async updateUser(
        id: string,
        body: UpdateUserBody,
        ctx: AuditContext
    ): Promise<UpdateUserResult> {
        return this.prisma.$transaction(
            async (tx) => {
                const existing = await tx.user.findUnique({
                    where: { id },
                    select: userSelectSafe,
                });

                if (!existing) {
                    throw new NotFoundException('User not found');
                }

                const diff = this.diffUser(existing, body);
                if (diff.length === 0) {
                    return { user: existing, changedFields: [] };
                }

                const data: Prisma.UserUpdateInput = { updatedBy: ctx.adminId };
                for (const field of diff) {
                    (data as Record<string, unknown>)[field] = body[field];
                }

                const updated = await tx.user.update({
                    where: { id },
                    select: userSelectSafe,
                    data,
                });

                for (const field of diff) {
                    const from = existing[field] as unknown;
                    const to = updated[field] as unknown;
                    await this.auditWriter.write(
                        {
                            adminId: ctx.adminId,
                            action: 'admin.user.update',
                            targetId: id,
                            payload: { field, from, to },
                            ipAddress: ctx.ipAddress,
                            userAgent: ctx.userAgent,
                        },
                        { tx }
                    );
                }

                return { user: updated, changedFields: diff };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
    }

    /**
     * Soft-ban a user: `isBanned = true`, `deletedAt = now()`. The
     * `User` row is preserved so all FK relationships (payments,
     * sessions, audit) keep their referential integrity.
     */
    async banUser(id: string, ctx: AuditContext): Promise<UserSafeRow> {
        if (id === ctx.adminId) {
            throw new NotFoundException('Cannot ban own account');
        }

        return this.prisma.$transaction(
            async (tx) => {
                const existing = await tx.user.findUnique({
                    where: { id },
                    select: userSelectSafe,
                });
                if (!existing) {
                    throw new NotFoundException('User not found');
                }

                const updated = await tx.user.update({
                    where: { id },
                    select: userSelectSafe,
                    data: {
                        isBanned: true,
                        deletedAt: new Date(),
                        updatedBy: ctx.adminId,
                    },
                });

                await this.auditWriter.write(
                    {
                        adminId: ctx.adminId,
                        action: 'admin.user.ban',
                        targetId: id,
                        payload: {
                            previousIsBanned: existing.isBanned,
                            previousDeletedAt: existing.deletedAt,
                        },
                        ipAddress: ctx.ipAddress,
                        userAgent: ctx.userAgent,
                    },
                    { tx }
                );

                return updated;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
    }

    /**
     * Lift a soft-ban. Sets `isBanned = false, deletedAt = null`.
     */
    async unbanUser(id: string, ctx: AuditContext): Promise<UserSafeRow> {
        return this.prisma.$transaction(
            async (tx) => {
                const existing = await tx.user.findUnique({
                    where: { id },
                    select: userSelectSafe,
                });
                if (!existing) {
                    throw new NotFoundException('User not found');
                }

                const updated = await tx.user.update({
                    where: { id },
                    select: userSelectSafe,
                    data: {
                        isBanned: false,
                        deletedAt: null,
                        updatedBy: ctx.adminId,
                    },
                });

                await this.auditWriter.write(
                    {
                        adminId: ctx.adminId,
                        action: 'admin.user.unban',
                        targetId: id,
                        payload: {
                            previousIsBanned: existing.isBanned,
                            previousDeletedAt: existing.deletedAt,
                        },
                        ipAddress: ctx.ipAddress,
                        userAgent: ctx.userAgent,
                    },
                    { tx }
                );

                return updated;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
    }

    /**
     * Grant admin privileges. Refuses to grant to a banned user.
     */
    async grantAdmin(id: string, ctx: AuditContext): Promise<UserSafeRow> {
        return this.prisma.$transaction(
            async (tx) => {
                const existing = await tx.user.findUnique({
                    where: { id },
                    select: userSelectSafe,
                });
                if (!existing) {
                    throw new NotFoundException('User not found');
                }
                if (existing.isBanned) {
                    throw new NotFoundException(
                        'Cannot grant admin to a banned user'
                    );
                }

                const updated = await tx.user.update({
                    where: { id },
                    select: userSelectSafe,
                    data: { isAdmin: true, updatedBy: ctx.adminId },
                });

                await this.auditWriter.write(
                    {
                        adminId: ctx.adminId,
                        action: 'admin.user.grant',
                        targetId: id,
                        payload: { from: existing.isAdmin, to: true },
                        ipAddress: ctx.ipAddress,
                        userAgent: ctx.userAgent,
                    },
                    { tx }
                );

                return updated;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
    }

    /**
     * Revoke admin privileges. Refuses to revoke the calling admin's
     * own privileges — that would lock the system out of all admin
     * operations if it were the only admin.
     */
    async revokeAdmin(id: string, ctx: AuditContext): Promise<UserSafeRow> {
        if (id === ctx.adminId) {
            throw new NotFoundException('Cannot revoke own admin');
        }

        return this.prisma.$transaction(
            async (tx) => {
                const existing = await tx.user.findUnique({
                    where: { id },
                    select: userSelectSafe,
                });
                if (!existing) {
                    throw new NotFoundException('User not found');
                }

                const updated = await tx.user.update({
                    where: { id },
                    select: userSelectSafe,
                    data: { isAdmin: false, updatedBy: ctx.adminId },
                });

                await this.auditWriter.write(
                    {
                        adminId: ctx.adminId,
                        action: 'admin.user.revoke',
                        targetId: id,
                        payload: { from: existing.isAdmin, to: false },
                        ipAddress: ctx.ipAddress,
                        userAgent: ctx.userAgent,
                    },
                    { tx }
                );

                return updated;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
    }

    /**
     * Pure diff: returns the subset of mutable fields whose incoming
     * value differs from the persisted record. `undefined` means
     * "not present in body" and is ignored.
     */
    private diffUser(
        existing: UserSafeRow,
        body: UpdateUserBody
    ): MutableField[] {
        const changed: MutableField[] = [];
        for (const field of MUTABLE_FIELDS) {
            const incoming = body[field];
            if (incoming === undefined) continue;
            const current = existing[field] as unknown;
            if (current !== incoming) {
                changed.push(field);
            }
        }
        return changed;
    }
}
