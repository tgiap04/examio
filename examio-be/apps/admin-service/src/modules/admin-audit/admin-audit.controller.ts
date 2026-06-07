import { Controller, Get, Query, UseGuards, UsePipes } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { AdminGuard } from '@examio/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminAuditService } from './admin-audit.service';
import { ListAuditQueryDto } from './dto/list-audit.query';

@ApiTags('Admin / Audit')
@ApiBearerAuth()
@Controller('admin/audit')
@UseGuards(AdminGuard)
@Throttle({ admin: { ttl: 60000, limit: 30 } })
@UsePipes(ZodValidationPipe)
export class AdminAuditController {
    constructor(private readonly audit: AdminAuditService) {}

    @Get()
    @ApiOperation({
        summary:
            'Paginated audit log. Filter by adminId, targetId, action prefix, or date range.',
    })
    async list(@Query() query: ListAuditQueryDto) {
        return this.audit.listAudit(query);
    }
}