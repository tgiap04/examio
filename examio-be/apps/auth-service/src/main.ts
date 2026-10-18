import { config } from 'dotenv';
import { join } from 'path';

// Load .env file from service directory
config({ path: join(process.cwd(), 'apps', 'auth-service', '.env') });

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { AuthServiceModule } from './auth-service.module';
import {
    HEALTH_ROUTES_EXCLUDED_FROM_PREFIX,
    Logger,
} from '@examio/observability';
import { PROTO_FILES } from '@examio/contracts';
import { grpcServerOptions } from '@examio/grpc';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
    // Fail fast on misconfiguration: a missing or weak JWT_SECRET would let
    // access tokens be forged or brute-forced. Refuse to boot rather than
    // silently running with an insecure secret.
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        throw new Error(
            'JWT_SECRET is missing or too short (minimum 32 characters required)'
        );
    }

    // Fail fast on misconfiguration: refresh tokens are encrypted at rest
    // with this key (RefreshTokenCipherService). A missing or weak key
    // would either crash on first use or weaken the at-rest protection.
    if (
        !process.env.REFRESH_TOKEN_ENC_KEY ||
        process.env.REFRESH_TOKEN_ENC_KEY.length < 32
    ) {
        throw new Error(
            'REFRESH_TOKEN_ENC_KEY is missing or too short (minimum 32 characters required)'
        );
    }

    // Create HTTP application
    const app = await NestFactory.create(AuthServiceModule, {
        bufferLogs: true,
    });
    app.useLogger(app.get(Logger));

    // Trust the first hop (gateway) so req.ip/req.ips reflect the real
    // client IP from a trusted proxy chain rather than a client-spoofable
    // X-Forwarded-For header read directly off the request.
    app.getHttpAdapter().getInstance().set('trust proxy', 1);

    app.use(cookieParser());

    // Global prefix to match gateway proxy paths
    app.setGlobalPrefix('api/v1', {
        exclude: HEALTH_ROUTES_EXCLUDED_FROM_PREFIX,
    });

    // Enable CORS
    app.enableCors({
        origin: process.env.FRONTEND_URL || [
            'http://localhost:5173',
            'http://localhost:3001',
            'http://127.0.0.1:5173',
        ],
        credentials: true,
    });

    // Connect gRPC microservice
    const grpcPort = process.env.GRPC_PORT || '50051';
    app.connectMicroservice<MicroserviceOptions>(
        grpcServerOptions([PROTO_FILES.auth])
    );

    // Start all microservices
    await app.startAllMicroservices();

    // Start HTTP server
    const httpPort = process.env.PORT || 3000;
    await app.listen(httpPort);

    console.log(`🚀 Auth Service HTTP running on port ${httpPort}`);
    console.log(`🔌 Auth Service gRPC running on port ${grpcPort}`);
}
bootstrap();
