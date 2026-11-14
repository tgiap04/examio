import { Module } from '@nestjs/common';
import { AuthJwtModule } from '@kmaedu/auth-jwt';
import { HealthModule, LoggerModule } from '@kmaedu/observability';
import { RedisModule, RedisReadinessCheck } from '@kmaedu/redis';
import { PrismaModule, PrismaReadinessCheck } from './prisma';
import { ContentGrpcModule } from './grpc/content-grpc.module';
import { AIModule } from './modules/ai/ai.module';
import { DocumentClientModule } from './modules/document-client/document-client.module';
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
        // Service identity `content` (token subject `svc:content`): what r2 (UploadFile, DeleteObjects)
        // and ai-service (ListModels) allow-list, and the name this service asks auth to sign tokens for.
        // User tokens (HTTP and the forwarded ones of assessment's gRPC calls) are verified against auth's JWKS.
        AuthJwtModule.forRoot({ serviceName: 'content', serviceClient: true }),
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
