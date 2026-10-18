import { Module } from '@nestjs/common';
import {
    DatabaseModule,
    DatabaseReadinessCheck,
    PrismaService,
} from '@examio/database';
import { GenerateIdService, EventsModule } from '@examio/common';
import { RedisModule, RedisReadinessCheck } from '@examio/redis';
import { FinanceServiceController } from './finance-service.controller';
import { FinanceServiceService } from './finance-service.service';
import { WalletGrpcController } from './modules/wallet/wallet.grpc.controller';
import { UserEventHandler } from './events/user-event.handler';
import { WalletModule } from './modules/wallet/wallet.module';
import { SePayModule } from './modules/sepay/sepay.module';
import { HealthModule, LoggerModule } from '@examio/observability';

@Module({
    imports: [
        LoggerModule.forRoot('finance-service'),
        HealthModule.forRoot({
            checks: [DatabaseReadinessCheck, RedisReadinessCheck],
        }),
        DatabaseModule,
        RedisModule,
        EventsModule,
        WalletModule,
        SePayModule,
    ],
    controllers: [FinanceServiceController, WalletGrpcController],
    providers: [
        FinanceServiceService,
        PrismaService,
        GenerateIdService,
        UserEventHandler,
    ],
})
export class FinanceServiceModule {}
