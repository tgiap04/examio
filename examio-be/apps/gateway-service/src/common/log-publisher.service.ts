import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '@examio/redis';

export type PublishableService = 'auth' | 'gateway';

const LOG_LIST_KEY = (svc: PublishableService) => `logs:${svc}`;
const LOG_CHANNEL = (svc: PublishableService) => `logs:stream:${svc}`;
const MAX_ENTRIES = 5000;

@Injectable()
export class LogPublisherService implements OnModuleDestroy {
    private readonly logger = new Logger(LogPublisherService.name);
    private readonly services = new Set<PublishableService>();

    constructor(private readonly redis: RedisService) {}

    /**
     * Register a service so flush() closes its subscription.
     */
    register(service: PublishableService): void {
        this.services.add(service);
    }

    /**
     * Push a log line to Redis LIST + publish to pub/sub channel.
     */
    async publish(service: PublishableService, line: string): Promise<void> {
        const client = this.redis.getClient();
        const entry = JSON.stringify({
            ts: new Date().toISOString(),
            service,
            line,
            redacted: line,
        });

        await client.lpush(LOG_LIST_KEY(service), entry);
        await client.ltrim(LOG_LIST_KEY(service), 0, MAX_ENTRIES - 1);
        await this.redis.publish(LOG_CHANNEL(service), entry);
    }

    onModuleDestroy(): void {
        for (const svc of this.services) {
            this.logger.debug(`LogPublisher cleanup for ${svc}`);
        }
    }
}