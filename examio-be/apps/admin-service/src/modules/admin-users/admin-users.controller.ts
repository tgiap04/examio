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
    UsePipes,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';

import { AdminUsersService } from './admin-users.service';
import { AuthedAdminRequest, auditContextOf } from '../admin-roles/audit-context';
import { AdminValidationPipe } from '../admin-roles/dto/validation.pipe';
import { ListUsersQueryDto } from './dto/list-users.query';
import { UpdateUserBodyDto } from './dto/update-user.body';
import { RequirePermissions, forwardUser } from '@examio/auth-jwt';

@ApiTags('Admin / Users')
@ApiBearerAuth()
@Controller('admin/users')
@RequirePermissions('user:manage')
@Throttle({ admin: { ttl: 60000, limit: 30 } })
@UsePipes(AdminValidationPipe)
export class AdminUsersController {
    constructor(private readonly adminUsers: AdminUsersService) {}

    @Get()
    @ApiOperation({
        summary: 'Paginated list of users with filters (no password).',
    })
    async list(@Query() query: ListUsersQueryDto, @Req() req: AuthedAdminRequest) {
        return this.adminUsers.listUsers(query, forwardUser(req));
    }

    @Get(':id')
    @ApiOperation({
        summary:
            'User detail (profile + last session).',
    })
    async detail(@Param('id') id: string, @Req() req: AuthedAdminRequest) {
        return this.adminUsers.getUserDetail(id, forwardUser(req));
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
        const ctx = auditContextOf(req);
        const result = await this.adminUsers.updateUser(id, body, ctx, forwardUser(req));
        return { user: result.user, changedFields: result.changedFields };
    }

    @Post(':id/ban')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Ban a user (auth SetUserStatus: sessions revoked, authzVersion bumped).',
    })
    async ban(
        @Param('id') id: string,
        @Req() req: AuthedAdminRequest
    ) {
        const ctx = auditContextOf(req);
        const user = await this.adminUsers.banUser(id, ctx, forwardUser(req));
        return { user };
    }

    @Post(':id/unban')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Lift a soft-ban.' })
    async unban(
        @Param('id') id: string,
        @Req() req: AuthedAdminRequest
    ) {
        const ctx = auditContextOf(req);
        const user = await this.adminUsers.unbanUser(id, ctx, forwardUser(req));
        return { user };
    }
}
