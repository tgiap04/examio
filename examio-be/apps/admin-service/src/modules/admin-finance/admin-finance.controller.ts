import {
    BadRequestException,
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Post,
    Req,
    UsePipes,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { Request } from 'express';

import { AdminFinanceService, AuditContext } from './admin-finance.service';
import { CreditBody, CreditBodyDto } from './dto/credit.body';
import { RefundBody, RefundBodyDto } from './dto/refund.body';
import { SetTierBody, SetTierBodyDto } from './dto/set-tier.body';
import { RequirePermissions, forwardUser } from '@examio/auth-jwt';
import { uuidv7 } from '@examio/grpc';

interface AuthedAdminRequest extends Request {
    user?: { id: string };
}

/**
 * Optional `Idempotency-Key` header (1-200 chars): a repeated key applies the
 * write once. Without it each request gets a fresh key, so a client-library
 * retry of ONE request (same key) still cannot double-apply.
 */
function idempotencyKeyOf(req: Request): string {
    const header = req.headers?.['idempotency-key'];
    const value = (Array.isArray(header) ? header[0] : header)?.trim();
    if (value && value.length <= 200) return value;
    if (value) {
        throw new BadRequestException({
            statusCode: 400,
            code: 'INVALID_IDEMPOTENCY_KEY',
            message: 'Idempotency-Key must be at most 200 characters',
        });
    }
    return `admin:${uuidv7()}`;
}

/**
 * High-risk admin financial endpoints. Restricted to 10 req/min via the
 * `admin` named throttler — tighter than the generic 30 req/min applied
 * to stats / users to limit blast radius.
 *
 * Note on body typing: parameters are decorated with the DTO class so
 * `ZodValidationPipe` picks up the schema, but the runtime value is
 * the plain inferred type which we forward to the service.
 */
@Controller('admin/finance')
@RequirePermissions('finance:admin')
@Throttle({ admin: { ttl: 60000, limit: 10 } })
@UsePipes(ZodValidationPipe)
export class AdminFinanceController {
    constructor(private readonly adminFinance: AdminFinanceService) {}

    @Post('refund')
    @HttpCode(HttpStatus.OK)
    async refund(
        @Body() body: RefundBodyDto,
        @Req() req: AuthedAdminRequest
    ) {
        const ctx = this.buildAuditContext(req);
        const result = await this.adminFinance.refund(
            body as unknown as RefundBody,
            ctx,
            forwardUser(req),
            idempotencyKeyOf(req)
        );
        return { success: true, data: result };
    }

    @Post('credit')
    @HttpCode(HttpStatus.OK)
    async credit(
        @Body() body: CreditBodyDto,
        @Req() req: AuthedAdminRequest
    ) {
        const ctx = this.buildAuditContext(req);
        const result = await this.adminFinance.credit(
            body as unknown as CreditBody,
            ctx,
            forwardUser(req),
            idempotencyKeyOf(req)
        );
        return { success: true, data: result };
    }

    @Post('set-tier')
    @HttpCode(HttpStatus.OK)
    async setTier(
        @Body() body: SetTierBodyDto,
        @Req() req: AuthedAdminRequest
    ) {
        const ctx = this.buildAuditContext(req);
        const result = await this.adminFinance.setTier(
            body as unknown as SetTierBody,
            ctx,
            forwardUser(req),
            idempotencyKeyOf(req)
        );
        return { success: true, data: result };
    }

    /**
     * Alias for `set-tier` so the FE admin dashboard
     * (which calls `POST /admin/finance/tier`) can hit the same handler.
     * Both routes are kept; the canonical path is `set-tier`.
     */
    @Post('tier')
    @HttpCode(HttpStatus.OK)
    async tier(
        @Body() body: SetTierBodyDto,
        @Req() req: AuthedAdminRequest
    ) {
        return this.setTier(body, req);
    }

    private buildAuditContext(req: AuthedAdminRequest): AuditContext {
        const adminId = req.user?.id;
        if (!adminId) {
            // the permission guard guarantees req.user, but stay defensive.
            throw new Error('admin principal missing on request.user');
        }

        const headers = req.headers ?? {};
        const xff = headers['x-forwarded-for'];
        const ip =
            (Array.isArray(xff) ? xff[0] : xff?.split(',')[0]?.trim()) ||
            req.ip ||
            null;

        const ua = headers['user-agent'];
        const userAgent = Array.isArray(ua) ? ua[0] : ua ?? null;

        return {
            adminId,
            ipAddress: ip,
            userAgent,
        };
    }
}
