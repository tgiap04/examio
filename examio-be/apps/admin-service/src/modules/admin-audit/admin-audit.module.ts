import { Module } from '@nestjs/common';
import { DatabaseModule, PrismaService } from '@examio/database';
import { GrpcClientModule } from '@examio/grpc';

import { AUTH_GRPC_REGISTRATION, AuthClient } from '../../clients/auth.client';

import { AdminAuditController } from './admin-audit.controller';
import { AdminAuditService } from './admin-audit.service';

@Module({
    imports: [DatabaseModule, GrpcClientModule.register(AUTH_GRPC_REGISTRATION)],
    controllers: [AdminAuditController],
    providers: [AdminAuditService, PrismaService, AuthClient],
    exports: [AdminAuditService],
})
export class AdminAuditModule {}
