import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '@examio/redis';

export type PublishableService = 'auth' | 'gateway';

const LOG_LIST_KEY = (svc: PublishableService) => `logs:${svc}`;
const LOG_CHANNEL = (svc: PublishableService) => `logs:stream:${svc}`;
const MAX_ENTRIES = 5000;

// Param names that must never appear in cleartext inside a broadcast/stored
// log entry (auth tokens, session identifiers, credentials, OAuth codes).
const SENSITIVE_PARAM_NAMES = [
    'token',
    'refreshToken',
    'refresh_token',
    'code',
    'session_id',
    'password',
    'secret',
];

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
     * Redact sensitive data from a raw log line before it is broadcast to
     * admin log viewers or persisted in Redis.
     *
     * Two passes:
     * 1. Strips the query string off any URL-like path segment (e.g.
     *    `/api/v1/auth/refresh?token=abc` -> `/api/v1/auth/refresh`) - this
     *    is where tokens/session ids most commonly leak via proxied request
     *    logging.
     * 2. Masks any remaining `key=value` pair whose key matches a known
     *    sensitive param name, in case a sensitive value is echoed outside
     *    a URL query string (e.g. from a body/header dump).
     */
    private redact(line: string): string {
        let redacted = line.replace(/(\/[^\s?]*)\?[^\s]*/g, '$1');

        const sensitiveNamesPattern = SENSITIVE_PARAM_NAMES.join('|');
        const sensitiveKeyValueRegex = new RegExp(
            `\\b(${sensitiveNamesPattern})=[^\\s&]+`,
            'gi'
        );
        redacted = redacted.replace(sensitiveKeyValueRegex, '$1=***');

        return redacted;
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
            redacted: this.redact(line),
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