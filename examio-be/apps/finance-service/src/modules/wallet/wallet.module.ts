import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { GenerateIdService } from '@examio/common';
import { RedisService } from '@examio/redis';
import { WalletService } from './wallet.service';
import { WalletMoneyService } from './wallet-money.service';
import { EnsureWalletService } from './ensure-wallet.service';
import { WalletController } from './wallet.controller';
import { WalletRepository } from './wallet.repository';
import { WalletTransactionRepository } from './wallettransaction.repository';

@Module({
    imports: [],
    providers: [
        PrismaService,
        RedisService,
        WalletService,
        EnsureWalletService,
        WalletMoneyService,
        GenerateIdService,
        WalletRepository,
        WalletTransactionRepository,
    ],
    controllers: [WalletController],
    exports: [WalletService, EnsureWalletService, WalletMoneyService, WalletRepository, WalletTransactionRepository],
})
export class WalletModule {}
