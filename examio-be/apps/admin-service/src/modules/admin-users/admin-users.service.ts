import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@examio/database';
import { Metadata } from '@grpc/grpc-js';
import { AuthClient } from '../../clients/auth.client';

import type { AuditContext } from '../admin-roles/audit-context';
import { AuditWriterService } from '../../common/audit-writer.service';
import { writeAuditBestEffort } from '../admin-roles/best-effort-audit';
import { ListUsersQuery } from './dto/list-users.query';
import { UpdateUserBody } from './dto/update-user.body';
import { userSelectSafe, UserSafeRow } from './user-select.safe';

export type { AuditContext } from '../admin-roles/audit-context';
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

const MUTABLE_FIELDS = ['isVerified', 'name', 'bio'] as const;
type MutableField = (typeof MUTABLE_FIELDS)[number];

/**
 * AdminUsersService — admin-side CRUD over the `User` table.
 *
 * Every mutation:
 *  - runs inside prisma.$transaction with isolation = Serializable
 *  - writes one AdminAudit row per changed field via AuditWriter
 *  - explicitly excludes `password` from every select (`userSelectSafe`)
 *
 * Role, admin-flag and ban changes are NOT written here: they are auth RPCs
 * (`SetUserRole` / `SetSystemAdmin` / `SetUserStatus`) so every authz-relevant
 * write bumps `authzVersion` inside auth. `updateUser` only touches profile
 * fields (name, bio, isVerified).
 */
@Injectable()
export class AdminUsersService {
    private readonly logger = new Logger(AdminUsersService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly auditWriter: AuditWriterService,
        private readonly authClient: AuthClient
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
        if (query.isSystemAdmin !== undefined) {
            where.isSystemAdmin = query.isSystemAdmin;
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

                // Batch audit writes — one DB round-trip for all changed
                // fields instead of one adminAudit.create per field.
                const auditRows = diff.map((field) => {
                    const from = existing[field] as unknown;
                    const to = updated[field] as unknown;
                    return {
                        adminId: ctx.adminId,
                        action: 'admin.user.update',
                        targetId: id,
                        payload: { field, from, to },
                        ipAddress: ctx.ipAddress ?? null,
                        userAgent: ctx.userAgent ?? null,
                    };
                });

                const client: any = tx;
                await client.adminAudit.createMany({ data: auditRows });

                return { user: updated, changedFields: diff };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
    }

    /**
     * Ban through auth `SetUserStatus` (advisory lock, last-admin and self
     * guards, authzVersion bump, sessions revoked, outbox) acting as the
     * calling admin via their forwarded token. This service never writes
     * `User` for a ban and never signals the gateway: auth does both.
     */
    banUser(id: string, ctx: AuditContext, metadata: Metadata): Promise<UserSafeRow> {
        return this.setBanned(id, true, 'admin.user.ban', ctx, metadata);
    }

    /** Lift a ban through auth `SetUserStatus` (see `banUser`). */
    unbanUser(id: string, ctx: AuditContext, metadata: Metadata): Promise<UserSafeRow> {
        return this.setBanned(id, false, 'admin.user.unban', ctx, metadata);
    }

    private async findSafe(id: string): Promise<UserSafeRow> {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: userSelectSafe,
        });
        if (!user) throw new NotFoundException('User not found');
        return user;
    }

    private async setBanned(
        id: string,
        isBanned: boolean,
        action: 'admin.user.ban' | 'admin.user.unban',
        ctx: AuditContext,
        metadata: Metadata
    ): Promise<UserSafeRow> {
        const existing = await this.findSafe(id);
        await this.authClient.setUserStatus(id, isBanned, metadata);
        // Auth committed (its errors, e.g. 409 LAST_SYSTEM_ADMIN, were thrown
        // above): read the result back and record the admin-side audit row,
        // best-effort (auth's RoleChangeLog is the durable record).
        const updated = await this.findSafe(id);
        await writeAuditBestEffort(this.auditWriter, this.logger, {
            adminId: ctx.adminId,
            action,
            targetId: id,
            payload: { previousIsBanned: existing.isBanned },
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
        });
        return updated;
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
