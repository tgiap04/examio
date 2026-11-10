import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '../prisma';
import { PrismaService } from '../prisma';

/**
 * Payload accepted by AuditWriterService.write().
 *
 * NOTE: tx is optional — when provided, the audit row is written inside
 * the same database transaction so that audit + mutation either both
 * commit or both roll back. This is the recommended path for any
 * mutating admin action.
 */
export interface AuditWriteInput {
    adminId: string;
    action: string;
    targetId?: string | null;
    payload?: Record<string, unknown> | null;
    reason?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
}

export interface AuditWriteOptions {
    tx?: Prisma.TransactionClient;
}

/**
 * AuditWriterService — single entry point for writing AdminAudit rows.
 *
 * Built in Phase 04 (admin-users-and-audit). Other admin
 * features reuse it for their mutations. Audit row is
 * mandatory for every admin mutation: any failure to write MUST surface
 * to the caller so the controller returns 500 (and the surrounding tx
 * rolls back).
 */
@Injectable()
export class AuditWriterService {
    constructor(
        @Optional()
        @Inject(PrismaService)
        private readonly prisma: PrismaService
    ) {}

    /**
     * Write a single AdminAudit row. Pass `options.tx` to participate
     * in an outer prisma.$transaction (preferred for atomicity).
     */
    async write(
        input: AuditWriteInput,
        options: AuditWriteOptions = {}
    ): Promise<void> {
        // Cast through `any` because the AdminAudit model was added in
        // Phase 04 — the Prisma client must be regenerated (yarn prisma:generate)
        // before production builds. The runtime delegate exists as soon as the
        // schema is merged; this cast keeps Phase 06 unblocked locally without
        // forcing a prisma:generate from this commit.
        const client: any = options.tx ?? this.prisma;

        await client.adminAudit.create({
            data: {
                adminId: input.adminId,
                action: input.action,
                targetId: input.targetId ?? null,
                payload:
                    input.payload === undefined || input.payload === null
                        ? Prisma.DbNull
                        : (input.payload as Prisma.InputJsonValue),
                reason: input.reason ?? null,
                ipAddress: input.ipAddress ?? null,
                userAgent: input.userAgent ?? null,
            },
        });
    }

    /**
     * Convenience helper: extract IP + UA from a raw Express request and
     * delegate to `write()`. Saves callers from duplicating the header
     * parsing logic.
     *
     * `req` is typed as `any` because the Nest `Request` type is Express-only
     * and some injection contexts (e.g. GraphQL) use different shapes.
     */
    async writeFromRequest(
        req: any,
        adminId: string,
        action: string,
        targetId?: string,
        payload?: Record<string, unknown> | null,
        reason?: string | null
    ): Promise<void> {
        const headers = req.headers ?? {};
        const xff = headers['x-forwarded-for'];
        const ipAddress =
            (Array.isArray(xff)
                ? xff[0]
                : xff?.split(',')[0]?.trim()) ||
            req.ip ||
            null;

        const ua = headers['user-agent'];
        const userAgent = Array.isArray(ua) ? ua[0] : ua ?? null;

        await this.write({
            adminId,
            action,
            targetId: targetId ?? null,
            payload: payload ?? null,
            reason: reason ?? null,
            ipAddress,
            userAgent,
        });
    }
}
