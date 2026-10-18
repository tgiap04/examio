import { Module } from '@nestjs/common';
import { MessagingModule } from '@examio/messaging';
import { LoggerModule } from '@examio/observability';

/**
 * Worker-role module (`ROLE=worker`): runs the outbox relay and the daily purge.
 * It talks to Postgres through the relay's own small pg pool, so it needs no
 * Prisma client and never competes with API request handling.
 */
@Module({
    imports: [
        LoggerModule.forRoot('auth-service'),
        MessagingModule.forRoot({ service: 'auth', relay: true }),
    ],
})
export class WorkerModule {}
