import { Module } from '@nestjs/common';
import { AuthJwtModule } from '@examio/auth-jwt';
import { HealthModule, LoggerModule } from '@examio/observability';
import { RedisModule, RedisReadinessCheck } from '@examio/redis';
import { PrismaModule, PrismaReadinessCheck } from './prisma';
import { WordFamilyModule } from './modules/word-family/word-family.module';

@Module({
    imports: [
        LoggerModule.forRoot('vocabulary-service'),
        HealthModule.forRoot({
            checks: [PrismaReadinessCheck, RedisReadinessCheck],
        }),
        PrismaModule,
        RedisModule,
        // Audience `vocabulary`: HTTP user tokens, forwarded admin tokens (gRPC) and
        // service tokens (exam GetWordFamily). The service token is also its own
        // identity towards r2 (the worker delete) via `svc:vocabulary`.
        AuthJwtModule.forRoot({ serviceName: 'vocabulary', serviceClient: true }),
        WordFamilyModule,
    ],
})
export class VocabularyServiceModule {}
