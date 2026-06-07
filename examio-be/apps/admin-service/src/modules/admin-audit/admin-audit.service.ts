import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@examio/database';

import { ListAuditQuery } from './dto/list-audit.query';

export interface ListAuditResult {
    rows: {
        id: string;
        adminId: string;
        action: string;
        targetId: string | null;
        payload: Record<string, unknown> | null;
        reason: string | null;
        ipAddress: string | null;
        userAgent: string | null;
        createdAt: Date;
        admin?: { id: string; email: string; username: string } | null;
    }[];
    total: number;
    page: number;
    pageSize: number;
}

/**
 * AdminAuditService — read-only query layer over AdminAudit rows.
 *
 * All endpoints are `@UseGuards(AdminGuard)` so only authenticated
 * admins may view audit history. Password-like fields do not exist on
 * AdminAudit — no explicit exclusion needed.
 */
@Injectable()
export class AdminAuditService {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Paginated list of audit rows with optional filters.
     * Includes the performing admin's basic profile (id, email, username).
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

        const [rows, total] = await this.prisma.$transaction([
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

        return {
            rows: rows as ListAuditResult['rows'],
            total,
            page: query.page,
            pageSize: query.pageSize,
        };
    }
}