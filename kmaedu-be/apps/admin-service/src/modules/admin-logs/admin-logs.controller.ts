import {
    Controller,
    Get,
    Post,
    Query,
    Sse,
    UnauthorizedException,
    MessageEvent,
    Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { Observable, Subject, takeUntil } from 'rxjs';
import { Response } from 'express';
import { randomBytes } from 'crypto';
import { RedisService } from '@kmaedu/redis';
import { AdminLogsService } from './admin-logs.service';
import { WatchableService } from './redis-log.service';
import { RecentQuerySchema, RecentQuery } from './dto/recent.query';
import { RequirePermissions } from '@kmaedu/auth-jwt';

const TICKET_TTL_SECONDS = 300;
const TICKET_KEY_PREFIX = 'sse:ticket:';

@Controller('admin/logs')
@RequirePermissions('logs:read')
@Throttle({ admin: { ttl: 60000, limit: 30 } })
export class AdminLogsController {
    constructor(
        private readonly adminLogsService: AdminLogsService,
        private readonly redis: RedisService
    ) {}

    @Get('recent')
    async getRecent(
        @Query(new ZodValidationPipe(RecentQuerySchema)) query: RecentQuery
    ) {
        const lines = await this.adminLogsService.getRecent(
            query.service as WatchableService,
            query.limit
        );
        return { lines };
    }

    @Post('ticket')
    async issueTicket() {
        const ticket = randomBytes(32).toString('hex');
        const client = this.redis.getClient();
        await client.set(
            `${TICKET_KEY_PREFIX}${ticket}`,
            'admin',
            'EX',
            TICKET_TTL_SECONDS
        );
        const expiresAt = new Date(Date.now() + TICKET_TTL_SECONDS * 1000);
        return { ticket, expiresAt };
    }

    @Sse('stream')
    stream(
        @Query('service') service: WatchableService,
        @Query('ticket') ticket: string,
        @Res() res: Response
    ): Observable<MessageEvent> {
        if (!service || (service !== 'auth' && service !== 'gateway')) {
            throw new UnauthorizedException('Invalid service');
        }
        if (!ticket) {
            throw new UnauthorizedException('Missing ticket');
        }

        const client = this.redis.getClient();
        const key = `${TICKET_KEY_PREFIX}${ticket}`;

        return new Observable<MessageEvent>((subscriber) => {
            (async () => {
                const userId = await client.get(key);
                if (!userId) {
                    subscriber.error(
                        new UnauthorizedException('Invalid or expired ticket')
                    );
                    return;
                }
                await client.del(key);

                const disconnect$ = new Subject<void>();
                res.on('close', () => {
                    disconnect$.next();
                    disconnect$.complete();
                });

                this.adminLogsService
                    .stream(service)
                    .pipe(takeUntil(disconnect$))
                    .subscribe({
                        next: (event) =>
                            subscriber.next(event as MessageEvent),
                        error: (err) => subscriber.error(err),
                        complete: () => subscriber.complete(),
                    });
            })().catch((err) => subscriber.error(err));

            return () => {
                /* teardown handled by disconnect$ subject */
            };
        });
    }
}
