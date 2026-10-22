import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { PrismaService } from '@examio/database';
import { GenerateIdService } from '@examio/common';
import { UserRepository } from '../repositories/user.repository';
import { GrpcClientModule } from '@examio/grpc';
import { RedisService } from '@examio/redis';
import { R2_GRPC_REGISTRATION, R2Client } from '../clients/r2.client';
import { UserUpdateModule } from '../users-admin/user-update.module';

@Module({
    imports: [GrpcClientModule.register(R2_GRPC_REGISTRATION), UserUpdateModule],
    controllers: [ProfileController],
    providers: [
        ProfileService,
        R2Client,
        PrismaService,
        GenerateIdService,
        UserRepository,
        RedisService,
    ],
    exports: [ProfileService],
})
export class ProfileModule {}
