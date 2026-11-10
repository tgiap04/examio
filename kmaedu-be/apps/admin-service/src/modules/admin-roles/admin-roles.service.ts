import { HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Metadata } from '@grpc/grpc-js';
import type { authV1 } from '@kmaedu/contracts';
import { AuthClient } from '../../clients/auth.client';
import { AuditWriterService } from '../../common/audit-writer.service';
import type { AuditContext } from './audit-context';
import { writeAuditBestEffort } from './best-effort-audit';
import {
    permissionMatrix,
    toProtoRole,
    toRoleChangeItem,
    toRoleUserItem,
    type RoleChangeItem,
    type RoleUserItem,
} from './admin-roles.mapper';
import type { SetRoleDto } from './dto/set-role.dto';
import type { SetSystemAdminDto } from './dto/set-system-admin.dto';
import type { ListRoleChangesQueryDto, ListRoleUsersQueryDto } from './dto/list-role-users.query';

interface Meta {
    page: number;
    limit: number;
    total: number;
}

/**
 * Admin-side role management. Every state change is an auth RPC made with the
 * calling admin's own token (auth enforces self/last-admin/permission and writes
 * RoleChangeLog + authzVersion + outbox); this service only maps and audits.
 */
@Injectable()
export class AdminRolesService {
    private readonly logger = new Logger(AdminRolesService.name);

    constructor(
        private readonly auth: AuthClient,
        private readonly audit: AuditWriterService
    ) {}

    matrix() {
        return permissionMatrix();
    }

    async listUsers(
        query: Pick<ListRoleUsersQueryDto, 'q' | 'role' | 'isSystemAdmin' | 'page' | 'limit'>,
        md: Metadata
    ): Promise<{ data: RoleUserItem[]; meta: Meta; systemAdminCount: number }> {
        // Count ACTIVE admins (the number the last-admin guard compares against).
        const [list, admins] = await Promise.all([
            this.auth.listUsers(
                {
                    query: query.q ?? '',
                    role: query.role ? toProtoRole(query.role) : undefined,
                    isSystemAdmin: query.isSystemAdmin,
                    isBanned: undefined,
                    page: query.page,
                    limit: query.limit,
                },
                md
            ),
            this.auth.listUsers(
                { query: '', isSystemAdmin: true, isBanned: false, page: 1, limit: 1 },
                md
            ),
        ]);
        return {
            data: (list.users ?? []).map(toRoleUserItem),
            meta: toMeta(list.page, query),
            systemAdminCount: admins.page?.total ?? 0,
        };
    }

    async setRole(
        id: string,
        dto: Pick<SetRoleDto, 'role' | 'reason'>,
        ctx: AuditContext,
        md: Metadata
    ): Promise<{ user: RoleUserItem }> {
        const before = await this.current(id, md);
        const after = requireUser(
            (await this.auth.setUserRole(id, toProtoRole(dto.role), dto.reason ?? '', md)).user
        );
        if (before.role !== after.role) {
            await writeAuditBestEffort(this.audit, this.logger, {
                adminId: ctx.adminId,
                action: 'admin.role.set_base',
                targetId: id,
                payload: { from: before.role, to: after.role, reason: dto.reason ?? null },
                ipAddress: ctx.ipAddress,
                userAgent: ctx.userAgent,
            });
        }
        return { user: after };
    }

    async setSystemAdmin(
        id: string,
        dto: Pick<SetSystemAdminDto, 'isSystemAdmin' | 'reason'>,
        ctx: AuditContext,
        md: Metadata
    ): Promise<{ user: RoleUserItem }> {
        const before = await this.current(id, md);
        const after = requireUser(
            (await this.auth.setSystemAdmin(id, dto.isSystemAdmin, md, dto.reason ?? '')).user
        );
        if (before.isSystemAdmin !== after.isSystemAdmin) {
            await writeAuditBestEffort(this.audit, this.logger, {
                adminId: ctx.adminId,
                action: 'admin.role.set_system_admin',
                targetId: id,
                payload: { from: before.isSystemAdmin, to: after.isSystemAdmin, reason: dto.reason ?? null },
                ipAddress: ctx.ipAddress,
                userAgent: ctx.userAgent,
            });
        }
        return { user: after };
    }

    /** The pre-change state (audit `from`); an unknown id is `404 USER_NOT_FOUND`. */
    private async current(id: string, md: Metadata): Promise<RoleUserItem> {
        try {
            return requireUser((await this.auth.getUser(id, md)).user);
        } catch (err) {
            if (err instanceof HttpException && err.getStatus() === 404) {
                throw new NotFoundException({ statusCode: 404, code: 'USER_NOT_FOUND', message: 'User not found' });
            }
            throw err;
        }
    }

    async listChanges(
        query: Pick<ListRoleChangesQueryDto, 'userId' | 'page' | 'limit'>,
        md: Metadata
    ): Promise<{ data: RoleChangeItem[]; meta: Meta }> {
        const res = await this.auth.listRoleChanges(
            { targetUserId: query.userId, page: query.page, limit: query.limit },
            md
        );
        return { data: (res.changes ?? []).map(toRoleChangeItem), meta: toMeta(res.page, query) };
    }
}

/** An RPC response without its `user` is treated as "no such user", never as a crash. */
function requireUser(user: authV1.User | undefined): RoleUserItem {
    if (!user) {
        throw new NotFoundException({ statusCode: 404, code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    return toRoleUserItem(user);
}

function toMeta(page: { total: number; page: number; limit: number } | undefined, q: { page: number; limit: number }): Meta {
    return { page: page?.page ?? q.page, limit: page?.limit ?? q.limit, total: page?.total ?? 0 };
}
