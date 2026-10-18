import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@examio/database';

import { ListAuditQuery } from './dto/list-audit.query';

export interface AuditRow {
    id: string;
    actorId: number;
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
    // e.g. "admin.finance.refund" → "payment"
    const parts = action.split('.');
    // parts = ["admin", "user", "grant"] → "user"
    // parts = ["admin", "finance", "refund"] → "finance"
    const domain = parts[1] ?? null;
    // Map domain to a user-facing target type
    switch (domain) {
        case 'user':
            return 'user';
        case 'finance':
            return 'payment';
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
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Paginated list of audit rows with optional filters.
     * Returns flat rows with actor/target info resolved from the joined
     * relations, matching the frontend `AuditRow` shape.
     */
    async listAudit(query: ListAuditQuery): Promise<ListAuditResult> {
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
                include: {
                    admin: {
                        select: { id: true, email: true, username: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: query.pageSize,
            }),
            this.prisma.adminAudit.count({ where }),
        ]);

        const rows: AuditRow[] = raw.map((r) => ({
            id: r.id,
            actorId: Number(r.adminId),
            actorName: r.admin?.username ?? `#${r.adminId}`,
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
}