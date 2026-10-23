import { Module } from '@nestjs/common';
import { PrismaModule, PrismaService } from './prisma';
import { GenerateIdService } from '@examio/common';
import { MessagingModule } from '@examio/messaging';
import { LoggerModule } from '@examio/observability';
import { UserAuthzChangedHandler } from './events/handlers/user-authz-changed.handler';
import { EnsureWalletService } from './modules/wallet/ensure-wallet.service';

/**
 * Worker-role module (`ROLE=worker`): consumes `finance.events` and relays the finance outbox. Handlers run
 * in the consumer's idempotency transaction on the shared Prisma client.
 */
@Module({
    imports: [
        LoggerModule.forRoot('finance-service'),
        PrismaModule,
        MessagingModule.forRoot({
            service: 'finance',
            relay: true,
            consume: { db: PrismaService },
        }),
    ],
    providers: [GenerateIdService, EnsureWalletService, UserAuthzChangedHandler],
})
export class WorkerModule {}
