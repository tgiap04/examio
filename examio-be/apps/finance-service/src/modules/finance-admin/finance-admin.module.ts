import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { GenerateIdService } from '@examio/common';
import { RedisService } from '@examio/redis';
import { WalletModule } from '../wallet/wallet.module';
import { SePayModule } from '../sepay/sepay.module';
import { FINANCE_MESSAGING } from '../../finance-messaging';
import { FinanceAdminService } from './finance-admin.service';
import { UserFinanceService } from './user-finance.service';
import { FinanceAdminGrpcController } from './finance-admin.grpc.controller';

@Module({
    imports: [WalletModule, SePayModule, FINANCE_MESSAGING],
    providers: [PrismaService, RedisService, GenerateIdService, FinanceAdminService, UserFinanceService],
    controllers: [FinanceAdminGrpcController],
    exports: [FinanceAdminService],
})
export class FinanceAdminModule {}
