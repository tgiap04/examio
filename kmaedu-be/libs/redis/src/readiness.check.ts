import { Injectable } from '@nestjs/common';
import type { ReadinessCheck } from '@kmaedu/observability';
import { RedisService } from './redis.service';

/** Readiness probe: Redis answers a command round-trip. */
@Injectable()
export class RedisReadinessCheck implements ReadinessCheck {
    readonly name = 'redis';

    constructor(private readonly redis: RedisService) {}

    async check(): Promise<void> {
        await this.redis.exists('health:readiness');
    }
}
