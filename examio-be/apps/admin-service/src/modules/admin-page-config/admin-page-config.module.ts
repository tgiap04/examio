import { Module } from '@nestjs/common';
import { PrismaModule, PrismaService } from '../../prisma';
import { GrpcClientModule } from '@examio/grpc';

import { GATEWAY_GRPC_REGISTRATION, GatewayClient } from '../../clients/gateway.client';
import { AdminPageConfigController } from './admin-page-config.controller';
import { AdminPageConfigService } from './admin-page-config.service';
import { AdminPageFlagsGrpcController } from './admin-page-flags.grpc.controller';

@Module({
    imports: [PrismaModule, GrpcClientModule.register(GATEWAY_GRPC_REGISTRATION)],
    controllers: [AdminPageConfigController, AdminPageFlagsGrpcController],
    providers: [AdminPageConfigService, PrismaService, GatewayClient],
    exports: [AdminPageConfigService],
})
export class AdminPageConfigModule {}
