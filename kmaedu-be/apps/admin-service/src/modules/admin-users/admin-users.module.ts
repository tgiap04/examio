import { Module } from '@nestjs/common';
import { GrpcClientModule } from '@kmaedu/grpc';

import { AdminCommonModule } from '../../common/admin-common.module';
import { AUTH_GRPC_REGISTRATION, AuthClient } from '../../clients/auth.client';
import { AUTH_USERS_GRPC_REGISTRATION, AuthUsersClient } from '../../clients/auth-users.client';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
    imports: [
        AdminCommonModule,
        GrpcClientModule.register(AUTH_GRPC_REGISTRATION, AUTH_USERS_GRPC_REGISTRATION),
    ],
    controllers: [AdminUsersController],
    providers: [AdminUsersService, AuthClient, AuthUsersClient],
    exports: [AdminUsersService],
})
export class AdminUsersModule {}
