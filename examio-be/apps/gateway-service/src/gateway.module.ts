import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { HttpModule } from '@nestjs/axios';
import { AuthJwtModule } from '@examio/auth-jwt';
import { RedisModule, RedisReadinessCheck } from '@examio/redis';
import { DatabaseModule } from '@examio/database';

import { GatewayController } from './gateway.controller';
import { ProxyMiddleware } from './middleware/proxy.middleware';
import { ProxyService } from './services/proxy.service';
import { ConfigService } from './services/config.service';
import { LogPublisherService } from './common/log-publisher.service';

// Config (page feature-flags)
import { ConfigController } from './controllers/config.controller';
import { PageEnabledGuard } from './guards/page-enabled.guard';

// Auth
import { AuthProxyController } from './controllers/auth-proxy.controller';

// Exam Service
import { QuizsetProxyController } from './controllers/quizset-proxy.controller';
import { FlashcardsetProxyController } from './controllers/flashcardset-proxy.controller';
import { ExamRoomProxyController } from './controllers/examroom-proxy.controller';
import { ExamSessionProxyController } from './controllers/examsession-proxy.controller';
import { ExamAttemptProxyController } from './controllers/examattempt-proxy.controller';
import { StudyRoomProxyController } from './controllers/study-room-proxy.controller';
import { SubjectProxyController } from './controllers/subject-proxy.controller';

// Finance & Profile
import {
    WalletProxyController,
    PaymentProxyController,
    ProfileProxyController,
    DevicesProxyController,
} from './controllers/wallet-profile-proxy.controller';

// AI & Study
import {
    AIProxyController,
    AIChatProxyController,
    FlashcardStudyProxyController,
    CheatingLogProxyController,
} from './controllers/ai-study-proxy.controller';

// R2 Storage
import { R2ProxyController } from './controllers/r2-proxy.controller';

// Webhook (external callbacks)
import { WebhookProxyController } from './controllers/webhook-proxy.controller';
import { StudentProxyController } from './controllers/student-proxy.controller';

// Word Family
import { WordFamilyProxyController } from './controllers/word-family-proxy.controller';

// Admin
import { AdminProxyController } from './controllers/admin-proxy.controller';
import { HealthModule, LoggerModule } from '@examio/observability';

@Module({
    imports: [
        LoggerModule.forRoot('gateway-service'),
        HealthModule.forRoot({ checks: [RedisReadinessCheck] }),
        // Verify-only guards (no global ones until phase 05's dispatcher).
        AuthJwtModule.forRoot({ serviceName: 'gateway', globalGuards: false }),
        RedisModule,
        DatabaseModule,
        // Rate limiting: 100 requests per minute
        ThrottlerModule.forRoot([
            {
                ttl: 60000, // 1 minute
                limit: 100,
            },
        ]),
        HttpModule.register({
            timeout: 30000,
            maxRedirects: 5,
        }),
    ],
    controllers: [
        GatewayController,
        // Auth
        AuthProxyController,
        // Exam
        QuizsetProxyController,
        FlashcardsetProxyController,
        ExamRoomProxyController,
        ExamSessionProxyController,
        ExamAttemptProxyController,
        StudyRoomProxyController,
        SubjectProxyController,
        // Finance & Profile
        WalletProxyController,
        PaymentProxyController,
        ProfileProxyController,
        DevicesProxyController,
        // AI & Study
        AIProxyController,
        AIChatProxyController,
        FlashcardStudyProxyController,
        CheatingLogProxyController,
        // R2 Storage
        R2ProxyController,
        // Webhook (external callbacks)
        WebhookProxyController,
        // Student
        StudentProxyController,
        // Word Family
        WordFamilyProxyController,
        // Admin
        AdminProxyController,
        // Config (page feature-flags)
        ConfigController,
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
        ProxyService,
        ConfigService,
        LogPublisherService,
        PageEnabledGuard,
    ],
})
export class GatewayModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(ProxyMiddleware).forRoutes('*');
    }
}
