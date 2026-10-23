import { Module, forwardRef } from '@nestjs/common';
import { R2DeleteTaskWriter } from '@examio/messaging';
import { QuizsetService } from './quizset.service';
import { QuizsetController } from './quizset.controller';
import { PrismaService } from '../../prisma';
import { GenerateIdService } from '@examio/common';
import { GrpcClientModule } from '@examio/grpc';
import { RedisService } from '@examio/redis';
import { R2_GRPC_REGISTRATION, R2Client } from '../../clients/r2.client';
import { QuizSetRepository } from './quizset.repository';
import { QuizsetSharingController } from './quizset-sharing.controller';
import { QuizsetSharingService } from './quizset-sharing.service';
import { QuizSetOwnerResolver } from './quizset-owner.resolver';
import { UserSearchService } from '../common/user-search.service';

@Module({
    imports: [GrpcClientModule.register(R2_GRPC_REGISTRATION)],
    providers: [
        PrismaService,
        RedisService,
        QuizsetService,
        GenerateIdService,
        R2Client,
        R2DeleteTaskWriter,
        QuizSetRepository,
        QuizsetSharingService,
        QuizSetOwnerResolver,
        UserSearchService,
    ],
    controllers: [QuizsetController, QuizsetSharingController],
    exports: [QuizsetService, QuizSetRepository, QuizSetOwnerResolver],
})
export class QuizsetModule {}
