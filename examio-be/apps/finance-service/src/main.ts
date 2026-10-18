import { config } from 'dotenv';
import { join } from 'path';

// Load .env file from service directory
config({ path: join(process.cwd(), 'apps', 'finance-service', '.env') });

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { FinanceServiceModule } from './finance-service.module';
import {
    HEALTH_ROUTES_EXCLUDED_FROM_PREFIX,
    Logger,
} from '@examio/observability';
import { PROTO_FILES } from '@examio/contracts';
import { grpcServerOptions } from '@examio/grpc';

async function bootstrap() {
    // Fail fast on a missing/weak signing secret instead of degrading into
    // per-request 401s (or, worse, a guessable key). See security audit H8/H6.
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        throw new Error('JWT_SECRET missing or too short (min 32 chars)');
    }

    // HTTP server
    const app = await NestFactory.create(FinanceServiceModule, {
        bufferLogs: true,
    });
    app.useLogger(app.get(Logger));

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

    // gRPC microservice (WalletService + SubscriptionService)
    app.connectMicroservice<MicroserviceOptions>(
        grpcServerOptions([PROTO_FILES.wallet, PROTO_FILES.subscription])
    );

    await app.startAllMicroservices();
    const httpPort = process.env.PORT ?? 3000;
    const grpcPort = process.env.GRPC_PORT || 50051;
    await app.listen(httpPort);

    console.log(`🚀 Finance Service is running on port ${httpPort}`);
    console.log(`📡 gRPC server is running on port ${grpcPort}`);
}
bootstrap();
