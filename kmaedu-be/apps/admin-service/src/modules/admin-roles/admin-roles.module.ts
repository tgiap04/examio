import { Module } from '@nestjs/common';
import { GrpcClientModule } from '@kmaedu/grpc';
import { AUTH_GRPC_REGISTRATION, AuthClient } from '../../clients/auth.client';
import { AdminCommonModule } from '../../common/admin-common.module';
import { AdminRolesController } from './admin-roles.controller';
import { AdminRolesService } from './admin-roles.service';

@Module({
    imports: [AdminCommonModule, GrpcClientModule.register(AUTH_GRPC_REGISTRATION)],
    controllers: [AdminRolesController],
    providers: [AdminRolesService, AuthClient],
})
export class AdminRolesModule {}
