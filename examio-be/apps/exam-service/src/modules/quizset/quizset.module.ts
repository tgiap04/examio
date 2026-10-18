import { Module, forwardRef } from '@nestjs/common';
import { QuizsetService } from './quizset.service';
import { QuizsetController } from './quizset.controller';
import { PrismaService } from '@examio/database';
import {
    GenerateIdService,
    AuthModule,
} from '@examio/common';
import { GrpcClientModule } from '@examio/grpc';
import { RedisService } from '@examio/redis';
import { R2_GRPC_REGISTRATION, R2Client } from '../../clients/r2.client';
import { QuizSetRepository } from './quizset.repository';

@Module({
    imports: [AuthModule, GrpcClientModule.register(R2_GRPC_REGISTRATION)],
    providers: [
        PrismaService,
        RedisService,
        QuizsetService,
        GenerateIdService,
        R2Client,
        QuizSetRepository,
    ],
    controllers: [QuizsetController],
    exports: [QuizsetService, QuizSetRepository],
})
export class QuizsetModule {}
