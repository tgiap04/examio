import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Query,
    Req,
    UseGuards,
    UsePipes,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { Request } from 'express';
import { AdminGuard } from '@examio/common';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';

import { AdminUsersService, AuditContext } from './admin-users.service';
import { ListUsersQueryDto } from './dto/list-users.query';
import { UpdateUserBodyDto } from './dto/update-user.body';

interface AuthedAdminRequest extends Request {
    user?: { id: string };
}

@ApiTags('Admin / Users')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(AdminGuard)
@Throttle({ admin: { ttl: 60000, limit: 30 } })
@UsePipes(ZodValidationPipe)
export class AdminUsersController {
    constructor(private readonly adminUsers: AdminUsersService) {}

    @Get()
    @ApiOperation({
        summary: 'Paginated list of users with filters (no password).',
    })
    async list(@Query() query: ListUsersQueryDto) {
        return this.adminUsers.listUsers(query);
    }

    @Get(':id')
    @ApiOperation({
        summary:
            'User detail (profile + wallet + subscription + last session).',
    })
    async detail(@Param('id') id: string) {
        return this.adminUsers.getUserDetail(id);
    }

    @Patch(':id')
    @ApiOperation({
        summary:
            'Patch user. Writes one audit row per changed field (no-op body is a 400).',
    })
    async update(
        @Param('id') id: string,
        @Body() body: UpdateUserBodyDto,
        @Req() req: AuthedAdminRequest
    ) {
        if (Object.keys(body).length === 0) {
            throw new BadRequestException('No fields to update');
        }
        const ctx = this.buildAuditContext(req);
        const result = await this.adminUsers.updateUser(id, body, ctx);
        return { user: result.user, changedFields: result.changedFields };
    }

    @Post(':id/ban')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Soft-ban a user (sets isBanned + deletedAt).',
    })
    async ban(
        @Param('id') id: string,
        @Req() req: AuthedAdminRequest
    ) {
        const ctx = this.buildAuditContext(req);
        const user = await this.adminUsers.banUser(id, ctx);
        return { user };
    }

    @Post(':id/unban')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Lift a soft-ban.' })
    async unban(
        @Param('id') id: string,
        @Req() req: AuthedAdminRequest
    ) {
        const ctx = this.buildAuditContext(req);
        const user = await this.adminUsers.unbanUser(id, ctx);
        return { user };
    }

    @Post(':id/grant-admin')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Promote a user to admin.' })
    async grant(
        @Param('id') id: string,
        @Req() req: AuthedAdminRequest
    ) {
        const ctx = this.buildAuditContext(req);
        const user = await this.adminUsers.grantAdmin(id, ctx);
        return { user };
    }

    @Post(':id/revoke-admin')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Revoke admin privileges. Refuses to revoke self.',
    })
    async revoke(
        @Param('id') id: string,
        @Req() req: AuthedAdminRequest
    ) {
        const ctx = this.buildAuditContext(req);
        const user = await this.adminUsers.revokeAdmin(id, ctx);
        return { user };
    }

    /**
     * Extract IP and User-Agent from the inbound request. Mirrors the
     * helper used in admin-finance so all admin services surface a
     * stable audit envelope.
     */
    private buildAuditContext(req: AuthedAdminRequest): AuditContext {
        const adminId = req.user?.id;
        if (!adminId) {
            // AdminGuard guarantees req.user; stay defensive.
            throw new Error('AdminGuard did not attach req.user');
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
