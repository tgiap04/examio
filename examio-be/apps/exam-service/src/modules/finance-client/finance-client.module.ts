import { Module, Global } from '@nestjs/common';
import {
    FINANCE_GRPC_REGISTRATION,
    FinanceClient,
    GRPC_METADATA_ATTACHER,
    GrpcClientModule,
} from '@examio/grpc';
import { ServiceMetadata } from '@examio/auth-jwt';
import { FinanceClientService } from './finance-client.service';

@Global()
@Module({
    imports: [GrpcClientModule.register(FINANCE_GRPC_REGISTRATION)],
    providers: [
        { provide: GRPC_METADATA_ATTACHER, useExisting: ServiceMetadata },
        FinanceClient,
        FinanceClientService,
    ],
    exports: [FinanceClient, FinanceClientService],
})
export class FinanceClientModule {}
