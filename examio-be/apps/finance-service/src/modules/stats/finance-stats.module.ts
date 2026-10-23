import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { FinanceStatsGrpcController } from './finance-stats.grpc.controller';
import { FinanceStatsService } from './finance-stats.service';

@Module({
    providers: [PrismaService, FinanceStatsService],
    controllers: [FinanceStatsGrpcController],
    exports: [FinanceStatsService],
})
export class FinanceStatsModule {}
