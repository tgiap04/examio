import { Module } from '@nestjs/common';
import {
    DatabaseModule,
    DatabaseReadinessCheck,
    PrismaService,
} from '@examio/database';
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
import { SubjectModule } from './modules/subject/subject.module';
import { AIModule } from './modules/ai/ai.module';
import { AIChatModule } from './modules/ai-chat/ai-chat.module';
import { FinanceClientModule } from './modules/finance-client/finance-client.module';
import { R2Module } from './modules/r2/r2.module';
import { StudentModule } from './modules/student/student.module';
import { FlashcardStudyModule } from './modules/flashcard-study/flashcard-study.module';
import { WordFamilyModule } from './modules/word-family/word-family.module';
import { StudyRoomModule } from './modules/study-room/study-room.module';
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
            checks: [DatabaseReadinessCheck, RedisReadinessCheck],
        }),
        DatabaseModule,
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
        SubjectModule,
        AIModule,
        AIChatModule,
        R2Module,
        StudentModule,
        FlashcardStudyModule,
        WordFamilyModule,
        StudyRoomModule,
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
