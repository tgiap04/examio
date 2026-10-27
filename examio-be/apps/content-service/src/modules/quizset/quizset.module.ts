import { Module, forwardRef } from '@nestjs/common';
import { MessagingModule, R2DeleteTaskWriter } from '@examio/messaging';
import { QuizsetService } from './quizset.service';
import { QuizsetController } from './quizset.controller';
import { PrismaService } from '../../prisma';
import { GenerateIdService } from '@examio/common';
import { GrpcClientModule } from '@examio/grpc';
import { RedisService } from '@examio/redis';
import { R2_GRPC_REGISTRATION, R2Client } from '../../clients/r2.client';
import { CONTENT_MESSAGING } from '../../messaging/content-messaging';
import { QuizSetRepository } from './quizset.repository';
import { QuizsetSharingController } from './quizset-sharing.controller';
import { QuizsetSharingService } from './quizset-sharing.service';
import { QuizSetOwnerResolver } from './quizset-owner.resolver';
import { QuizSetSnapshotService } from './quiz-set-snapshot.service';
import { UserSearchService } from '../common/user-search.service';

@Module({
    imports: [GrpcClientModule.register(R2_GRPC_REGISTRATION), MessagingModule.forRoot(CONTENT_MESSAGING)],
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
        QuizSetSnapshotService,
        UserSearchService,
    ],
    controllers: [QuizsetController, QuizsetSharingController],
    exports: [QuizsetService, QuizSetRepository, QuizSetOwnerResolver, QuizSetSnapshotService],
})
export class QuizsetModule {}
