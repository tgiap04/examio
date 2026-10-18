import { config } from 'dotenv';
import { join } from 'path';

// Load .env file from service directory
config({ path: join(process.cwd(), 'apps', 'finance-service', '.env') });

import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { FinanceServiceModule } from './finance-service.module';
import {
    HEALTH_ROUTES_EXCLUDED_FROM_PREFIX,
    Logger,
} from '@examio/observability';

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

    // gRPC microservice for WalletService
    app.connectMicroservice<MicroserviceOptions>({
        transport: Transport.GRPC,
        options: {
            package: ['wallet', 'subscription'],
            protoPath: [
                join(__dirname, '../../../libs/common/src/protos/wallet.proto'),
                join(
                    __dirname,
                    '../../../libs/common/src/protos/subscription.proto'
                ),
            ],
            url: `0.0.0.0:${process.env.GRPC_PORT || 50053}`,
        },
    });

    await app.startAllMicroservices();
    await app.listen(process.env.PORT ?? 3003);

    console.log(
        `🚀 Finance Service is running on port ${process.env.PORT ?? 3003}`
    );
    console.log(
        `📡 gRPC server is running on port ${process.env.GRPC_PORT || 50053}`
    );
}
bootstrap();
