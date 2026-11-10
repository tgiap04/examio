import { Module } from '@nestjs/common';
import { PrismaModule, PrismaService } from './prisma';
import { GenerateIdService } from '@examio/common';
import { MessagingModule } from '@examio/messaging';
import { LoggerModule } from '@examio/observability';
import { UserAuthzChangedHandler } from './events/handlers/user-authz-changed.handler';
import { EnsureWalletService } from './modules/wallet/ensure-wallet.service';
import { SubscriptionChangedPublisher } from './modules/sepay/subscription-changed.publisher';
import { SubscriptionExpiryService } from './modules/sepay/subscription-expiry.service';
import { SubscriptionExpirySweeper } from './modules/sepay/subscription-expiry.sweeper';

/**
 * Worker-role module (`ROLE=worker`): consumes `finance.events`, relays the finance outbox and sweeps lapsed subscriptions
 * (`SUBSCRIPTION_EXPIRY_SWEEP_MS`, default 60000). Handlers run
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
    providers: [
        GenerateIdService,
        EnsureWalletService,
        UserAuthzChangedHandler,
        SubscriptionChangedPublisher,
        SubscriptionExpiryService,
        SubscriptionExpirySweeper,
    ],
})
export class WorkerModule {}
