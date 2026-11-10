import { Injectable, Logger } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { PrismaService } from '../../prisma';

import { AuthClient } from '../../clients/auth.client';

import { ListAuditQuery } from './dto/list-audit.query';

export interface AuditRow {
    id: string;
    actorId: string;
    actorName: string;
    action: string;
    targetType: string | null;
    targetId: string | null;
    metadata: Record<string, unknown> | null;
    reason: string | null;
    createdAt: string;
}

export interface ListAuditResult {
    rows: AuditRow[];
    total: number;
    page: number;
    pageSize: number;
}

/** Derive a human-readable target type from the action code. */
function deriveTargetType(action: string): string | null {
    // e.g. "admin.user.grant" → "user"
    const parts = action.split('.');
    // parts = ["admin", "user", "grant"] → "user"
    const domain = parts[1] ?? null;
    // Map domain to a user-facing target type
    switch (domain) {
        case 'user':
            return 'user';
        default:
            return domain;
    }
}

/**
 * AdminAuditService — read-only query layer over AdminAudit rows.
 *
 * All endpoints require `admin:access` so only authenticated
 * admins may view audit history. Password-like fields do not exist on
 * AdminAudit — no explicit exclusion needed.
 */
@Injectable()
export class AdminAuditService {
    private readonly logger = new Logger(AdminAuditService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly auth: AuthClient
    ) {}

    /**
     * Paginated list of audit rows with optional filters.
     * Returns flat rows with actor/target info resolved from the joined
     * relations, matching the frontend `AuditRow` shape.
     */
    async listAudit(query: ListAuditQuery, metadata: Metadata): Promise<ListAuditResult> {
        const where = {} as any;

        if (query.adminId) {
            where.adminId = query.adminId;
        }
        if (query.targetId) {
            where.targetId = query.targetId;
        }
        if (query.action) {
            where.action = { contains: query.action, mode: 'insensitive' };
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

        const [raw, total] = await this.prisma.$transaction([
            this.prisma.adminAudit.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: query.pageSize,
            }),
            this.prisma.adminAudit.count({ where }),
        ]);

        const names = await this.actorNames(raw.map((r) => r.adminId), metadata);
        const rows: AuditRow[] = raw.map((r) => ({
            id: r.id,
            actorId: r.adminId,
            actorName: names.get(r.adminId) ?? `#${r.adminId}`,
            action: r.action,
            targetType: deriveTargetType(r.action),
            targetId: r.targetId,
            metadata: r.payload as Record<string, unknown> | null,
            reason: r.reason,
            createdAt: r.createdAt.toISOString(),
        }));

        return {
            rows,
            total,
            page: query.page,
            pageSize: query.pageSize,
        };
    }

    /**
     * Actor labels (`name || username`, the rule of the FE admin dropdown) from auth (the `User` table is auth's): one batched
     * `GetUsersByIds` with the caller's admin token for the distinct ids on the
     * page. The log stays readable (`#<id>`) when the lookup fails.
     */
    private async actorNames(adminIds: string[], metadata: Metadata): Promise<Map<string, string>> {
        const ids = [...new Set(adminIds)];
        if (ids.length === 0) return new Map();
        try {
            const { users } = await this.auth.getUsersByIds(ids, metadata);
            return new Map(users.map((u) => [u.id, u.name || u.username]));
        } catch (err) {
            this.logger.warn(`audit actor names unavailable: ${String(err)}`);
            return new Map();
        }
    }
}
