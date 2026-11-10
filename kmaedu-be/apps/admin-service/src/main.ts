import { config } from 'dotenv';
import { join } from 'path';

// Load .env file from service directory
config({ path: join(process.cwd(), 'apps', 'admin-service', '.env') });

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import * as cookieParser from 'cookie-parser';

import { PROTO_FILES } from '@kmaedu/contracts';
import { grpcServerOptions } from '@kmaedu/grpc';
import { HttpErrorEnvelopeFilter } from '@kmaedu/http';
import { AdminServiceModule } from './admin-service.module';
import {
    HEALTH_ROUTES_EXCLUDED_FROM_PREFIX,
    Logger,
} from '@kmaedu/observability';

async function bootstrap() {
    // HTTP server
    const app = await NestFactory.create(AdminServiceModule, {
        bufferLogs: true,
    });
    app.useLogger(app.get(Logger));

    app.setGlobalPrefix('api/v1', {
        exclude: HEALTH_ROUTES_EXCLUDED_FROM_PREFIX,
    });
    app.use(cookieParser());
    // `{ statusCode, code, message, requestId }`, like gateway + auth.
    app.useGlobalFilters(new HttpErrorEnvelopeFilter());

    // Enable CORS
    app.enableCors({
        origin: process.env.FRONTEND_URL || [
            'http://localhost:5173',
            'http://localhost:3001',
            'http://127.0.0.1:5173',
        ],
        credentials: true,
    });

    // AdminService.GetPageFlags (the gateway pulls it at boot); inherits the global guards.
    app.connectMicroservice<MicroserviceOptions>(
        grpcServerOptions([PROTO_FILES.admin]),
        { inheritAppConfig: true }
    );
    await app.startAllMicroservices();

    const httpPort = process.env.PORT || 3000;
    await app.listen(httpPort);

    console.log(`🚀 Admin Service HTTP running on port ${httpPort}`);
    console.log(`🔌 Admin Service gRPC running on port ${process.env.GRPC_PORT || '50051'}`);
}
bootstrap();
