import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Req,
    UsePipes,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import { AdminPageConfigService, AuditContext } from './admin-page-config.service';
import { TogglePageBodyDto } from './dto/toggle-page.body';
import { RequirePermissions } from '@examio/auth-jwt';

@ApiTags('Admin / Page Config')
@ApiBearerAuth()
@Controller('admin/page-config')
@RequirePermissions('admin:access')
@Throttle({ admin: { ttl: 60000, limit: 30 } })
@UsePipes(ZodValidationPipe)
export class AdminPageConfigController {
    constructor(private readonly service: AdminPageConfigService) {}

    @Get()
    @ApiOperation({ summary: 'Danh sách trang + trạng thái bật/tắt' })
    async list() {
        return this.service.list();
    }

    @Patch(':key')
    @ApiOperation({ summary: 'Bật/tắt một trang hiển thị (global)' })
    @ApiParam({ name: 'key', description: 'Page key (TOGGLEABLE_PAGE_KEYS)' })
    async toggle(
        @Param('key') key: string,
        @Body() body: TogglePageBodyDto,
        @Req() req: Request
    ) {
        return this.service.toggle(key, body.enabled, this.buildAuditContext(req));
    }

    private buildAuditContext(req: Request): AuditContext {
        const user = req['user'] as { id?: string } | undefined;
        const ip =
            (req.headers['x-forwarded-for'] as string) ||
            req.socket?.remoteAddress ||
            undefined;
        return { adminId: user?.id ?? 'unknown', ipAddress: ip };
    }
}
