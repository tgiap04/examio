import { Module } from '@nestjs/common';
import {
    PrismaModule,
    PrismaReadinessCheck,
    PrismaService,
} from './prisma';
import {
    RedisModule,
    RedisReadinessCheck,
    RedisService,
} from '@examio/redis';
import {
    GenerateIdService,
    CryptoService,
    EventsModule,
} from '@examio/common';
import { ExamServiceController } from './exam-service.controller';
import { ExamServiceService } from './exam-service.service';

// Import sub-modules
import { QuizsetModule } from './modules/quizset/quizset.module';
import { QuizPracticeModule } from './modules/quiz-practice/quiz-practice.module';
import { ExamRoomModule } from './modules/examroom/examroom.module';
import { ExamSessionModule } from './modules/examsession/examsession.module';
import { ExamAttemptModule } from './modules/examattempt/examattempt.module';
import { CheatingLogModule } from './modules/cheatinglog/cheatinglog.module';
import { FlashcardSetModule } from './modules/flashcardset/flashcardset.module';
import { AIModule } from './modules/ai/ai.module';
import { FinanceClientModule } from './modules/finance-client/finance-client.module';
import { DocumentClientModule } from './modules/document-client/document-client.module';
import { StudentModule } from './modules/student/student.module';
import { FlashcardStudyModule } from './modules/flashcard-study/flashcard-study.module';
import { UserProfileModule } from './modules/user-profile/user-profile.module';
import { HealthModule, LoggerModule } from '@examio/observability';
import { AuthJwtModule } from '@examio/auth-jwt';

// The legacy event subscriber consumes from a queue named after the service,
// the only queue name RabbitMQ grants the `exam` broker user.
process.env.SERVICE_NAME ??= 'exam-service';

@Module({
    imports: [
        LoggerModule.forRoot('exam-service'),
        HealthModule.forRoot({
            checks: [PrismaReadinessCheck, RedisReadinessCheck],
        }),
        PrismaModule,
        RedisModule,
        AuthJwtModule.forRoot({ serviceName: 'exam', serviceClient: true }),
        EventsModule,
        FinanceClientModule,
        UserProfileModule,
        QuizsetModule,
        QuizPracticeModule,
        ExamRoomModule,
        ExamSessionModule,
        ExamAttemptModule,
        CheatingLogModule,
        FlashcardSetModule,
        AIModule,
        DocumentClientModule,
        StudentModule,
        FlashcardStudyModule,
    ],
    controllers: [ExamServiceController],
    providers: [
        ExamServiceService,
        PrismaService,
        RedisService,
        GenerateIdService,
        CryptoService,
    ],
})
export class ExamServiceModule {}
