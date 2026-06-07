import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LogPublisherService } from '../common/log-publisher.service';

@Injectable()
export class ProxyMiddleware implements NestMiddleware {
    private readonly logger = new Logger(ProxyMiddleware.name);

    constructor(private readonly logPublisher: LogPublisherService) {
        this.logPublisher.register('gateway');
    }

    use(req: Request, res: Response, next: NextFunction) {
        const startTime = Date.now();
        const logLine = () =>
            `→ ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startTime}ms`;

        this.logger.log(logLine());

        res.on('finish', () => {
            this.logPublisher
                .publish('gateway', logLine())
                .catch((err) => this.logger.error(`Failed to publish log: ${err.message}`));
        });

        next();
    }
}
