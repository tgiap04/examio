import { Module } from '@nestjs/common';
import { DatabaseModule, PrismaService } from '@examio/database';
import { GenerateIdService } from '@examio/common';
import { MessagingModule } from '@examio/messaging';
import { LoggerModule } from '@examio/observability';
import { UserAuthzChangedHandler } from './events/handlers/user-authz-changed.handler';
import { EnsureWalletService } from './modules/wallet/ensure-wallet.service';

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
    providers: [GenerateIdService, EnsureWalletService, UserAuthzChangedHandler],
})
export class WorkerModule {}
