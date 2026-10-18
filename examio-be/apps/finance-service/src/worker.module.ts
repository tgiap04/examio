import { Module } from '@nestjs/common';
import { DatabaseModule, PrismaService } from '@examio/database';
import { GenerateIdService } from '@examio/common';
import { MessagingModule } from '@examio/messaging';
import { LoggerModule } from '@examio/observability';
import { UserRegisteredHandler } from './events/handlers/user-registered.handler';

/**
 * Worker-role module (`ROLE=worker`): consumes `finance.events`. Handlers run
 * in the consumer's idempotency transaction on the shared Prisma client.
 */
@Module({
    imports: [
        LoggerModule.forRoot('finance-service'),
        DatabaseModule,
        MessagingModule.forRoot({
            service: 'finance',
            consume: { db: PrismaService },
        }),
    ],
    providers: [GenerateIdService, UserRegisteredHandler],
})
export class WorkerModule {}
