import { Controller, Get, Query, UsePipes } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';

import { AdminStatsService } from './admin-stats.service';
import { SeriesQueryDto } from './dto/series.query';
import { RequirePermissions } from '@examio/auth-jwt';

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
    async getOverview() {
        return this.adminStatsService.getOverview();
    }

    @Get('series')
    @ApiOperation({
        summary:
            'Time-series points for signups / traffic / revenue charts, bucketed by day with gaps filled to zero.',
    })
    async getSeries(@Query() query: SeriesQueryDto) {
        return this.adminStatsService.getSeries(query.name, query.range);
    }

    @Get('sources')
    @ApiOperation({
        summary:
            'Signup attribution: user counts grouped by utm_source (null → "direct"), top 20 desc.',
    })
    async getSources(@Query('range') range?: '7d' | '30d' | '90d') {
        return this.adminStatsService.getSourceBreakdown(
            range && ['7d', '30d', '90d'].includes(range) ? range : undefined
        );
    }
}
