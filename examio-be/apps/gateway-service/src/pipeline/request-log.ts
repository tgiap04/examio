import type { IncomingMessage, ServerResponse } from 'http';
import { Injectable, Logger } from '@nestjs/common';
import { LogPublisherService } from '../common/log-publisher.service';

/**
 * Today's request log line (`→ METHOD url status ms`), written when the response
 * finishes: to the application log (path only, no query) and to the Redis admin
 * log stream through `LogPublisherService` (which redacts tokens and queries).
 */
@Injectable()
export class RequestLog {
    private readonly logger = new Logger('Gateway');

    constructor(private readonly publisher: LogPublisherService) {
        this.publisher.register('gateway');
    }

    attach(req: IncomingMessage & { originalUrl?: string }, res: ServerResponse): void {
        const startedAt = Date.now();
        const url = req.originalUrl ?? req.url ?? '';
        res.once('finish', () => {
            const line = `→ ${req.method} ${url} ${res.statusCode} ${Date.now() - startedAt}ms`;
            this.logger.log(line.replace(/\?\S*/, ''));
            this.publisher
                .publish('gateway', line)
                .catch((err: Error) => {
                    // A response that finishes after Redis was closed (shutdown) is not a failure.
                    if (this.publisher.isClosed()) return;
                    this.logger.error(`Failed to publish log: ${err.message}`);
                });
        });
    }
}
