import { Module } from '@nestjs/common';
import { AuthJwtModule } from '@examio/auth-jwt';
import { MessagingModule } from '@examio/messaging';
import { HealthModule, LoggerModule } from '@examio/observability';
import { RedisModule, RedisReadinessCheck } from '@examio/redis';
import { PrismaModule, PrismaReadinessCheck, PrismaService } from './prisma';
import { AIChatModule } from './modules/ai-chat/ai-chat.module';
import { SubjectModule } from './modules/subject/subject.module';

@Module({
    imports: [
        LoggerModule.forRoot('ai-chat-service'),
        HealthModule.forRoot({
            checks: [PrismaReadinessCheck, RedisReadinessCheck],
        }),
        PrismaModule,
        RedisModule,
        // Service identity `ai-chat` (token subject `svc:ai-chat`): the caller allow-listed by ai-service,
        // and the name this service asks auth to sign tokens for. User tokens are verified against auth's JWKS.
        AuthJwtModule.forRoot({ serviceName: 'ai-chat', serviceClient: true }),
        // One consumer for `aichat.events` (`document.deleted`, `finance.subscription.changed`). Its
        // handlers only touch this service's own database and cache, so it runs in the API process.
        // The service publishes nothing (the broker user has no publish grant either).
        MessagingModule.forRoot({ service: 'aichat', consume: { db: PrismaService } }),
        AIChatModule,
        SubjectModule,
    ],
})
export class AIChatServiceModule {}
