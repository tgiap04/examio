import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { PrismaService } from '../prisma';
import { GenerateIdService } from '@kmaedu/common';
import { UserRepository } from '../repositories/user.repository';
import { GrpcClientModule } from '@kmaedu/grpc';
import { RedisService } from '@kmaedu/redis';
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
