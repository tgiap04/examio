import { Module, Global } from '@nestjs/common';
import { GrpcClientModule } from '@examio/grpc';
import { FinanceClientService } from './finance-client.service';
import {
    FINANCE_GRPC_REGISTRATION,
    FinanceClient,
} from '../../clients/finance.client';

@Global()
@Module({
    imports: [GrpcClientModule.register(FINANCE_GRPC_REGISTRATION)],
    providers: [FinanceClient, FinanceClientService],
    exports: [FinanceClient, FinanceClientService],
})
export class FinanceClientModule {}
