import { Controller, Get, Query, Req, UsePipes } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';

import { AdminStatsService } from './admin-stats.service';
import { SeriesQueryDto } from './dto/series.query';
import { RequirePermissions, forwardUser } from '@examio/auth-jwt';
import type { AuthedAdminRequest } from '../admin-roles/audit-context';

@ApiTags('Admin / Stats')
@ApiBearerAuth()
@Controller('admin/stats')
@RequirePermissions('stats:read')
@UsePipes(ZodValidationPipe)
@Throttle({ admin: { ttl: 60000, limit: 30 } })
export class AdminStatsController {
    constructor(private readonly adminStatsService: AdminStatsService) {}

    @Get('overview')
    @ApiOperation({ summary: 'Top-level KPI tiles for the admin dashboard' })
    async getOverview(@Req() req: AuthedAdminRequest) {
        return this.adminStatsService.getOverview(forwardUser(req));
    }

    @Get('series')
    @ApiOperation({
        summary:
            'Time-series points for signups / traffic charts, bucketed by day with gaps filled to zero.',
    })
    async getSeries(@Query() query: SeriesQueryDto, @Req() req: AuthedAdminRequest) {
        return this.adminStatsService.getSeries(query.name, query.range, forwardUser(req));
    }

    @Get('sources')
    @ApiOperation({
        summary:
            'Signup attribution: user counts grouped by utm_source (null → "direct"), top 20 desc.',
    })
    async getSources(
        @Req() req: AuthedAdminRequest,
        @Query('range') range?: '7d' | '30d' | '90d'
    ) {
        return this.adminStatsService.getSourceBreakdown(
            forwardUser(req),
            range && ['7d', '30d', '90d'].includes(range) ? range : undefined
        );
    }
}
