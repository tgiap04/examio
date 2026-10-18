import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from '@examio/database';
import { GenerateIdService, EventsModule } from '@examio/common';
import { GrpcClientModule } from '@examio/grpc';
import { RedisModule } from '@examio/redis';
import { R2_GRPC_REGISTRATION, R2Client } from '../../clients/r2.client';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { AIRepository } from './ai.repository';

@Module({
    imports: [
        EventsModule,
        HttpModule,
        RedisModule,
        GrpcClientModule.register(R2_GRPC_REGISTRATION),
    ],
    controllers: [AIController],
    providers: [
        AIService,
        AIRepository,
        PrismaService,
        GenerateIdService,
        R2Client,
    ],
    exports: [AIService, AIRepository],
})
export class AIModule {}
