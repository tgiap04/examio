import { Module } from '@nestjs/common';
import { AuthJwtModule } from '@kmaedu/auth-jwt';
import { HealthModule, LoggerModule } from '@kmaedu/observability';
import { PrismaModule, PrismaReadinessCheck } from './prisma';
import { UploadModule } from './modules/upload/upload.module';

@Module({
    imports: [
        LoggerModule.forRoot('document-service'),
        HealthModule.forRoot({ checks: [PrismaReadinessCheck] }),
        PrismaModule,
        // Audience `document`: HTTP user tokens and forwarded user tokens (gRPC). The service token
        // is this service's own identity towards r2 (`svc:document`).
        AuthJwtModule.forRoot({ serviceName: 'document', serviceClient: true }),
        UploadModule,
    ],
})
export class DocumentServiceModule {}
