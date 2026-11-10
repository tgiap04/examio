import { Injectable } from '@nestjs/common';
import type { ReadinessCheck } from '@examio/observability';
import { PrismaService } from './prisma.service';

/** Readiness probe: this service's database answers a trivial query. */
@Injectable()
export class PrismaReadinessCheck implements ReadinessCheck {
    readonly name = 'db';

    constructor(private readonly prisma: PrismaService) {}

    async check(): Promise<void> {
        await this.prisma.$queryRaw`SELECT 1`;
    }
}
