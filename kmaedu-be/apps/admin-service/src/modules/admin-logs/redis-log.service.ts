import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@kmaedu/redis';
import { redactPII } from './log-redactor.util';

export type WatchableService = 'auth' | 'gateway';

const LOG_LIST_KEY = (service: WatchableService) => `logs:${service}`;
const LOG_STREAM_CHANNEL = (service: WatchableService) => `logs:stream:${service}`;
const MAX_ENTRIES = 5000;

export interface LogEntry {
    ts: string;
    service: WatchableService;
    line: string;
    redacted: string;
}

@Injectable()
export class RedisLogService {
    private readonly logger = new Logger(RedisLogService.name);

    constructor(private readonly redis: RedisService) {}

    /**
     * Push a log line to Redis LIST + publish to pub/sub channel.
     * Called by LogPublisherService in each service.
     */
    async push(service: WatchableService, rawLine: string): Promise<void> {
        const client = this.redis.getClient();
        const redacted = redactPII(rawLine);
        const entry = JSON.stringify({
            ts: new Date().toISOString(),
            service,
            line: rawLine,
            redacted,
        });

        await client.lpush(LOG_LIST_KEY(service), entry);
        await client.ltrim(LOG_LIST_KEY(service), 0, MAX_ENTRIES - 1);
        // Publish to pub/sub for real-time SSE subscribers
        await this.redis.publish(LOG_STREAM_CHANNEL(service), entry);
    }

    /**
     * Get N most recent log entries for a service.
     */
    async getRecent(
        service: WatchableService,
        limit = 200
    ): Promise<LogEntry[]> {
        const client = this.redis.getClient();
        const raw = await client.lrange(LOG_LIST_KEY(service), 0, limit - 1);

        return raw.map((item: string) => {
            try {
                return JSON.parse(item) as LogEntry;
            } catch {
                // Legacy raw line (backwards compat)
                return {
                    ts: '',
                    service,
                    line: item,
                    redacted: redactPII(item),
                } as LogEntry;
            }
        });
    }

    /**
     * Subscribe to real-time log stream for a service.
     * Returns an async iterator yielding new LogEntry objects.
     */
    subscribe(
        service: WatchableService,
        handler: (entry: LogEntry) => void
    ): () => void {
        const channel = LOG_STREAM_CHANNEL(service);

        // Handler wraps the raw message → LogEntry
        const wrapped = (message: string) => {
            try {
                const entry = JSON.parse(message) as LogEntry;
                handler(entry);
            } catch {
                // Legacy raw line
                handler({
                    ts: new Date().toISOString(),
                    service,
                    line: message,
                    redacted: redactPII(message),
                });
            }
        };

        this.redis.subscribe(channel, wrapped).catch((err) => {
            this.logger.error(`Failed to subscribe to ${channel}: ${err.message}`);
        });

        // Return unsubscribe function
        return () => {
            this.redis.unsubscribe(channel).catch((err) => {
                this.logger.warn(`Failed to unsubscribe ${channel}: ${err.message}`);
            });
        };
    }
}