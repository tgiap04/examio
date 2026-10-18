import { Injectable } from '@nestjs/common';
import type { ReadinessCheck } from '@examio/observability';
import { PrismaService } from './prisma.service';

/** Readiness probe: the database answers a trivial query. */
@Injectable()
export class DatabaseReadinessCheck implements ReadinessCheck {
    readonly name = 'database';

    constructor(private readonly prisma: PrismaService) {}

    async check(): Promise<void> {
        await this.prisma.$queryRaw`SELECT 1`;
    }
}
