import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { AuthClient } from '../../clients/auth.client';
import { AuthUsersClient } from '../../clients/auth-users.client';

import type { AuditContext } from '../admin-roles/audit-context';
import { AuditWriterService } from '../../common/audit-writer.service';
import { writeAuditBestEffort } from '../admin-roles/best-effort-audit';
import { ListUsersQuery } from './dto/list-users.query';
import { UpdateUserBody } from './dto/update-user.body';
import { UserSafeRow } from './user-select.safe';
import { toUserSafeRow } from './user-safe.mapper';

export type { AuditContext } from '../admin-roles/audit-context';
export interface ListUsersResult {
    rows: UserSafeRow[];
    total: number;
    page: number;
    pageSize: number;
}

export interface UserDetail {
    user: UserSafeRow;
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

const epoch = (iso?: string): string | undefined => (iso ? String(Date.parse(iso)) : undefined);

/**
 * AdminUsersService: admin-side view and edits of users, done entirely through
 * RPCs made with the calling admin's own token (`forwardUser(req)`). It never
 * touches the `User` table:
 *  - list/detail/profile edits: auth `ListUsers` / `GetUserAdminDetail` /
 *    `UpdateUserAdmin` (auth writes the row + `auth.user.updated` in one tx);
 *  - role, admin flag and ban: auth `SetUserRole` / `SetSystemAdmin` /
 *    `SetUserStatus` (see AdminRolesService and `banUser`).
 * Admin writes one AdminAudit row per changed field AFTER auth committed
 * (best effort: auth's own records are the durable ones).
 */
@Injectable()
export class AdminUsersService {
    private readonly logger = new Logger(AdminUsersService.name);

    constructor(
        private readonly auditWriter: AuditWriterService,
        private readonly authClient: AuthClient,
        private readonly authUsers: AuthUsersClient
    ) {}

    /** Paginated list; `search` matches email, username or name (case-insensitive contains). */
    async listUsers(query: ListUsersQuery, metadata: Metadata): Promise<ListUsersResult> {
        const res = await this.authClient.listUsers(
            {
                query: query.search ?? '',
                isSystemAdmin: query.isSystemAdmin,
                isBanned: query.isBanned,
                isVerified: query.isVerified,
                createdFrom: epoch(query.createdFrom),
                createdTo: epoch(query.createdTo),
                page: query.page,
                limit: query.pageSize,
            },
            metadata
        );
        return {
            rows: res.users.map(toUserSafeRow),
            total: res.page?.total ?? 0,
            page: query.page,
            pageSize: query.pageSize,
        };
    }

    /** Profile + last session (404 when auth has no such user). */
    async getUserDetail(id: string, metadata: Metadata): Promise<UserDetail> {
        const detail = await this.authUsers.getUserAdminDetail(id, metadata);
        const s = detail.lastSession;
        return {
            user: toUserSafeRow(detail.user!),
            lastSession: s
                ? {
                      id: s.id,
                      deviceName: s.deviceName ?? null,
                      browser: s.browser ?? null,
                      os: s.os ?? null,
                      ipAddress: s.ipAddress ?? null,
                      country: s.country ?? null,
                      city: s.city ?? null,
                      lastActivity: new Date(Number(s.lastActivity)),
                      isActive: s.isActive,
                  }
                : null,
        };
    }

    /**
     * Patch a user: diff the body against auth's current record, send only the
     * changed fields to `UpdateUserAdmin`, then audit `{ field, from, to }` per field.
     */
    async updateUser(
        id: string,
        body: UpdateUserBody,
        ctx: AuditContext,
        metadata: Metadata
    ): Promise<UpdateUserResult> {
        const existing = await this.findSafe(id, metadata);
        const diff = this.diffUser(existing, body);
        if (diff.length === 0) return { user: existing, changedFields: [] };

        const patch: Record<string, unknown> = {};
        for (const field of diff) patch[field] = body[field];
        const { user } = await this.authUsers.updateUserAdmin({ userId: id, ...patch }, metadata);
        const updated = toUserSafeRow(user!);

        for (const field of diff) {
            await writeAuditBestEffort(this.auditWriter, this.logger, {
                adminId: ctx.adminId,
                action: 'admin.user.update',
                targetId: id,
                payload: { field, from: existing[field] as unknown, to: updated[field] as unknown },
                ipAddress: ctx.ipAddress,
                userAgent: ctx.userAgent,
            });
        }
        return { user: updated, changedFields: diff };
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

    private async findSafe(id: string, metadata: Metadata): Promise<UserSafeRow> {
        const { user } = await this.authClient.getUser(id, metadata);
        return toUserSafeRow(user!);
    }

    private async setBanned(
        id: string,
        isBanned: boolean,
        action: 'admin.user.ban' | 'admin.user.unban',
        ctx: AuditContext,
        metadata: Metadata
    ): Promise<UserSafeRow> {
        // Best-effort read of the previous state for the audit row: auth's GetUser hides
        // soft-deleted legacy accounts, which SetUserStatus can still (un)ban. The RPC
        // itself is the authority on "unknown user" (404).
        const previous = await this.findSafe(id, metadata).catch((err: unknown) => {
            if (err instanceof HttpException && err.getStatus() === 404) return null;
            throw err;
        });
        const { user } = await this.authClient.setUserStatus(id, isBanned, metadata);
        // Auth committed (its errors, e.g. 409 LAST_SYSTEM_ADMIN, were thrown
        // above). Record the admin-side audit row, best-effort (auth's
        // RoleChangeLog is the durable record).
        const updated = toUserSafeRow(user!);
        await writeAuditBestEffort(this.auditWriter, this.logger, {
            adminId: ctx.adminId,
            action,
            targetId: id,
            payload: { previousIsBanned: previous?.isBanned ?? !isBanned },
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
        });
        return updated;
    }

    /**
     * Pure diff: returns the subset of mutable fields whose incoming value
     * differs from the persisted record. `undefined` means "not present in
     * body" and is ignored.
     */
    private diffUser(existing: UserSafeRow, body: UpdateUserBody): MutableField[] {
        const changed: MutableField[] = [];
        for (const field of MUTABLE_FIELDS) {
            const incoming = body[field];
            if (incoming === undefined) continue;
            if ((existing[field] as unknown) !== incoming) changed.push(field);
        }
        return changed;
    }
}
