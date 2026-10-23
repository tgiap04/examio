import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { GenerateIdService } from '@examio/common';
import { RedisService } from '@examio/redis';
import { SePayService } from './sepay.service';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionGrpcController } from './subscription.grpc.controller';
import { PaymentRepository } from './payment.repository';
import { WalletModule } from '../wallet/wallet.module';
import { FINANCE_MESSAGING } from '../../finance-messaging';
import { SubscriptionChangedPublisher } from './subscription-changed.publisher';

@Module({
    imports: [WalletModule, FINANCE_MESSAGING],
    providers: [
        PrismaService,
        RedisService,
        SePayService,
        WebhookService,
        PaymentService,
        SubscriptionService,
        SubscriptionChangedPublisher,
        PaymentRepository,
        GenerateIdService,
    ],
    controllers: [
        WebhookController,
        PaymentController,
        SubscriptionGrpcController,
    ],
    exports: [
        SePayService,
        WebhookService,
        PaymentService,
        SubscriptionService,
        SubscriptionChangedPublisher,
        PaymentRepository,
    ],
})
export class SePayModule {}
