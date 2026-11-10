import { Module } from '@nestjs/common';
import {
    PrismaModule,
    PrismaReadinessCheck,
    PrismaService,
} from './prisma';
import { GenerateIdService } from '@examio/common';
import { RedisModule, RedisReadinessCheck } from '@examio/redis';
import { FinanceServiceController } from './finance-service.controller';
import { FinanceServiceService } from './finance-service.service';
import { WalletGrpcController } from './modules/wallet/wallet.grpc.controller';
import { WalletModule } from './modules/wallet/wallet.module';
import { SePayModule } from './modules/sepay/sepay.module';
import { FinanceAdminModule } from './modules/finance-admin/finance-admin.module';
import { FinanceStatsModule } from './modules/stats/finance-stats.module';
import { FINANCE_MESSAGING } from './finance-messaging';
import { HealthModule, LoggerModule } from '@examio/observability';
import { AuthJwtModule } from '@examio/auth-jwt';

@Module({
    imports: [
        LoggerModule.forRoot('finance-service'),
        HealthModule.forRoot({
            checks: [PrismaReadinessCheck, RedisReadinessCheck],
        }),
        PrismaModule,
        RedisModule,
        AuthJwtModule.forRoot({ serviceName: 'finance', serviceClient: true }),
        FINANCE_MESSAGING,
        WalletModule,
        SePayModule,
        FinanceAdminModule,
        FinanceStatsModule,
    ],
    controllers: [FinanceServiceController, WalletGrpcController],
    providers: [
        FinanceServiceService,
        PrismaService,
        GenerateIdService,
    ],
})
export class FinanceServiceModule {}
