import { Module } from '@nestjs/common';
import { GenerateIdService } from '@examio/common';
import { GrpcClientModule } from '@examio/grpc';
import { MessagingModule } from '@examio/messaging';
import {
    GATEWAY_GRPC_REGISTRATION,
    GatewayControlClient,
    gatewayControlEnabled,
} from '../clients/gateway-control.client';
import { AuthzChangedPublisher } from './authz-changed.publisher';
import { RoleChangeRepository } from './role-change.repository';
import { RoleChangeService } from './role-change.service';

@Module({
    imports: [
        MessagingModule.forRoot({ service: 'auth' }),
        ...(gatewayControlEnabled()
            ? [GrpcClientModule.register(GATEWAY_GRPC_REGISTRATION)]
            : []),
    ],
    providers: [
        RoleChangeRepository,
        AuthzChangedPublisher,
        RoleChangeService,
        GatewayControlClient,
        GenerateIdService,
    ],
    exports: [RoleChangeService, AuthzChangedPublisher],
})
export class RolesModule {}
