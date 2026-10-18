import { Module } from '@nestjs/common';
import { GrpcClientModule } from '@examio/grpc';

import { AdminCommonModule } from '../../common/admin-common.module';
import { AUTH_GRPC_REGISTRATION, AuthClient } from '../../clients/auth.client';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
    imports: [AdminCommonModule, GrpcClientModule.register(AUTH_GRPC_REGISTRATION)],
    controllers: [AdminUsersController],
    providers: [AdminUsersService, AuthClient],
    exports: [AdminUsersService],
})
export class AdminUsersModule {}
