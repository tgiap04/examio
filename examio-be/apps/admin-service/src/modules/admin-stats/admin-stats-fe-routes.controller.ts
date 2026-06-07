import {
    BadRequestException,
    Controller,
    Get,
    Param,
    Query,
    UseGuards,
    UsePipes,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { AdminGuard } from '@examio/common';

import { AdminStatsService } from './admin-stats.service';

const ALLOWED_SERIES = ['signups', 'traffic', 'revenue'] as const;
type AllowedSeries = (typeof ALLOWED_SERIES)[number];

/**
 * Top-level alias routes for admin stats. Mirrors what the FE admin
 * dashboard calls:
 *   - `getOverviewApi` → GET /admin/overview
 *   - `getSeriesApi`   → GET /admin/series/:name?range=...
 *
 * The canonical implementation lives in `AdminStatsController` at
 *   GET /admin/stats/overview
 *   GET /admin/stats/series?name=...&range=...&bucket=...
 * (query-param form) and is kept for any internal callers. This
 * controller is the thin pass-through the FE expects.
 */
@Controller('admin')
@UseGuards(AdminGuard)
@UsePipes(ZodValidationPipe)
@Throttle({ admin: { ttl: 60000, limit: 30 } })
export class AdminStatsFeRoutesController {
    constructor(private readonly adminStatsService: AdminStatsService) {}

    @Get('overview')
    async getOverview() {
        return this.adminStatsService.getOverview();
    }

    @Get('series/:name')
    async getSeries(
        @Param('name') name: string,
        @Query('range') range?: '7d' | '30d' | '90d'
    ) {
        if (!ALLOWED_SERIES.includes(name as AllowedSeries)) {
            throw new BadRequestException(
                `Invalid series name '${name}'. Allowed: ${ALLOWED_SERIES.join(', ')}`,
            );
        }
        return this.adminStatsService.getSeries(
            name as AllowedSeries,
            range ?? '30d'
        );
    }
}
