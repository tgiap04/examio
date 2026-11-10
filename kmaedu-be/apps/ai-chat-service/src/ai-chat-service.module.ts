import { Module } from '@nestjs/common';
import { AuthJwtModule } from '@kmaedu/auth-jwt';
import { MessagingModule } from '@kmaedu/messaging';
import { HealthModule, LoggerModule } from '@kmaedu/observability';
import { RedisModule, RedisReadinessCheck } from '@kmaedu/redis';
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
        // One consumer for `aichat.events` (`document.deleted`). Its handler only touches this
        // service's own database, so it runs in the API process.
        // The service publishes nothing (the broker user has no publish grant either).
        MessagingModule.forRoot({ service: 'aichat', consume: { db: PrismaService } }),
        AIChatModule,
        SubjectModule,
    ],
})
export class AIChatServiceModule {}
