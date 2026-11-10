import type { Request } from 'express';

export interface AuditContext {
    adminId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
}

export interface AuthedAdminRequest extends Request {
    user?: { id: string };
}

/** Admin id + IP + User-Agent of the inbound request, for AdminAudit rows. */
export function auditContextOf(req: AuthedAdminRequest): AuditContext {
    const adminId = req.user?.id;
    if (!adminId) {
        // the permission guard guarantees req.user; stay defensive.
        throw new Error('admin principal missing on request.user');
    }
    const headers = req.headers ?? {};
    const xff = headers['x-forwarded-for'];
    const ip =
        (Array.isArray(xff) ? xff[0] : xff?.split(',')[0]?.trim()) || req.ip || null;
    const ua = headers['user-agent'];
    const userAgent = Array.isArray(ua) ? ua[0] : ua ?? null;
    return { adminId, ipAddress: ip, userAgent };
}
