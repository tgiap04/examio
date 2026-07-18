import { config } from 'dotenv';
import { join } from 'path';

// Load .env file from service directory
config({ path: join(process.cwd(), 'apps', 'admin-service', '.env') });

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import * as cookieParser from 'cookie-parser';

import { AdminServiceModule } from './admin-service.module';

async function bootstrap() {
    // Fail fast on a missing/weak signing secret instead of degrading into
    // per-request 401s (or, worse, a guessable key). See security audit H8/H6.
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        throw new Error('JWT_SECRET missing or too short (min 32 chars)');
    }

    // HTTP server
    const app = await NestFactory.create(AdminServiceModule);

    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());

    // Enable CORS
    app.enableCors({
        origin: process.env.FRONTEND_URL || [
            'http://localhost:5173',
            'http://localhost:3001',
            'http://127.0.0.1:5173',
        ],
        credentials: true,
    });

    // Optional gRPC microservice - enabled only when ENABLE_ADMIN_GRPC=true.
    // Phase 01 ships HTTP-only via the gateway; gRPC proto is intentionally
    // deferred until a real admin RPC contract is defined.
    if (process.env.ENABLE_ADMIN_GRPC === 'true') {
        const grpcPort = process.env.GRPC_PORT || '50056';
        app.connectMicroservice<MicroserviceOptions>({
            transport: Transport.GRPC,
            options: {
                package: 'admin',
                protoPath: join(
                    __dirname,
                    '../../../libs/common/src/protos/admin.proto'
                ),
                url: `0.0.0.0:${grpcPort}`,
            },
        });
        await app.startAllMicroservices();
        console.log(`📡 Admin Service gRPC running on port ${grpcPort}`);
    }

    const httpPort = process.env.PORT || 7006;
    await app.listen(httpPort);

    console.log(`🚀 Admin Service HTTP running on port ${httpPort}`);
}
bootstrap();
