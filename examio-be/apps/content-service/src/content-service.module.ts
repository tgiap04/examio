import { Module } from '@nestjs/common';
import { AuthJwtModule } from '@examio/auth-jwt';
import { HealthModule, LoggerModule } from '@examio/observability';
import { RedisModule, RedisReadinessCheck } from '@examio/redis';
import { PrismaModule, PrismaReadinessCheck } from './prisma';
import { ContentGrpcModule } from './grpc/content-grpc.module';
import { AIModule } from './modules/ai/ai.module';
import { DocumentClientModule } from './modules/document-client/document-client.module';
import { FinanceClientModule } from './modules/finance-client/finance-client.module';
import { FlashcardStudyModule } from './modules/flashcard-study/flashcard-study.module';
import { FlashcardSetModule } from './modules/flashcardset/flashcardset.module';
import { QuizPracticeModule } from './modules/quiz-practice/quiz-practice.module';
import { QuizsetModule } from './modules/quizset/quizset.module';
import { StudentContentModule } from './modules/student-content/student-content.module';
import { UserProfileModule } from './modules/user-profile/user-profile.module';

@Module({
    imports: [
        LoggerModule.forRoot('content-service'),
        HealthModule.forRoot({
            checks: [PrismaReadinessCheck, RedisReadinessCheck],
        }),
        PrismaModule,
        RedisModule,
        // Service identity `content` (token subject `svc:content`): what finance (Refund) and r2
        // (UploadFile, DeleteObjects) allow-list, and the name this service asks auth to sign tokens for.
        // User tokens (HTTP and the forwarded ones of assessment's gRPC calls) are verified against auth's JWKS.
        AuthJwtModule.forRoot({ serviceName: 'content', serviceClient: true }),
        FinanceClientModule,
        DocumentClientModule,
        // Consumes `content.events` (ai.generation.*, document.deleted, auth.user.updated): the handlers only
        // touch this service's own database and cache, so the consumer runs in the API process.
        UserProfileModule,
        QuizsetModule,
        QuizPracticeModule,
        FlashcardSetModule,
        FlashcardStudyModule,
        AIModule,
        StudentContentModule,
        ContentGrpcModule,
    ],
})
export class ContentServiceModule {}
