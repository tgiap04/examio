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
import { parseRoles } from '@examio/messaging';
import { WorkerModule } from './worker.module';

async function startWorker() {
    // Event consumer (auth.user.registered, ...). No HTTP/gRPC listener.
    const worker = await NestFactory.createApplicationContext(WorkerModule, {
        bufferLogs: true,
    });
    worker.useLogger(worker.get(Logger));
    worker.enableShutdownHooks();
    console.log('📥 Finance Service worker running (event consumer)');
}

async function startApi() {
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
        grpcServerOptions([PROTO_FILES.wallet, PROTO_FILES.subscription]),
        { inheritAppConfig: true }
    );

    await app.startAllMicroservices();
    const httpPort = process.env.PORT ?? 3000;
    const grpcPort = process.env.GRPC_PORT || 50051;
    await app.listen(httpPort);

    console.log(`🚀 Finance Service is running on port ${httpPort}`);
    console.log(`📡 gRPC server is running on port ${grpcPort}`);
}

async function bootstrap() {
    // ROLE=api | worker | api,worker (default api,worker).
    const roles = parseRoles();
    if (roles.has('api')) await startApi();
    if (roles.has('worker')) await startWorker();
}
bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
});
