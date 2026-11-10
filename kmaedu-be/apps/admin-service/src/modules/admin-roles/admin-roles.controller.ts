import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put, Query, Req, UsePipes } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions, forwardUser } from '@kmaedu/auth-jwt';
import { AdminRolesService } from './admin-roles.service';
import { AuthedAdminRequest, auditContextOf } from './audit-context';
import { ListRoleChangesQueryDto, ListRoleUsersQueryDto } from './dto/list-role-users.query';
import { SetRoleDto } from './dto/set-role.dto';
import { SetSystemAdminDto } from './dto/set-system-admin.dto';
import { AdminValidationPipe } from './dto/validation.pipe';

@ApiTags('Admin / Roles')
@ApiBearerAuth()
@Controller('admin/roles')
@RequirePermissions('role:assign')
@Throttle({ admin: { ttl: 60000, limit: 30 } })
@UsePipes(AdminValidationPipe)
export class AdminRolesController {
    constructor(private readonly roles: AdminRolesService) {}

    @Get()
    @ApiOperation({ summary: 'Read-only role -> permission matrix.' })
    matrix() {
        return this.roles.matrix();
    }

    @Get('users')
    @ApiOperation({ summary: 'Users with their role, paginated (auth ListUsers).' })
    users(@Query() query: ListRoleUsersQueryDto, @Req() req: AuthedAdminRequest) {
        return this.roles.listUsers(query, forwardUser(req));
    }

    @Get('changes')
    @ApiOperation({ summary: 'Role change history (auth ListRoleChanges).' })
    changes(@Query() query: ListRoleChangesQueryDto, @Req() req: AuthedAdminRequest) {
        return this.roles.listChanges(query, forwardUser(req));
    }

    @Put('users/:id/role')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Set the base role (STUDENT | TEACHER).' })
    setRole(@Param('id') id: string, @Body() body: SetRoleDto, @Req() req: AuthedAdminRequest) {
        return this.roles.setRole(id, body, auditContextOf(req), forwardUser(req));
    }

    @Put('users/:id/system-admin')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Grant or revoke SYSTEM_ADMIN.' })
    setSystemAdmin(@Param('id') id: string, @Body() body: SetSystemAdminDto, @Req() req: AuthedAdminRequest) {
        return this.roles.setSystemAdmin(id, body, auditContextOf(req), forwardUser(req));
    }
}
