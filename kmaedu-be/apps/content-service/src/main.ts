import { config } from 'dotenv';
import { join } from 'path';

// Load .env file from service directory
config({ path: join(process.cwd(), 'apps', 'content-service', '.env') });

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { HEALTH_ROUTES_EXCLUDED_FROM_PREFIX, Logger } from '@kmaedu/observability';
import { RedisUnavailableFilter } from '@kmaedu/redis';
import { PROTO_FILES } from '@kmaedu/contracts';
import { grpcServerOptions } from '@kmaedu/grpc';
import { parseRoles } from '@kmaedu/messaging';
import { ContentServiceModule } from './content-service.module';
import { WorkerModule } from './worker.module';

async function startWorker() {
    // Outbox relay + generation reaper + R2 delete-task worker. No HTTP/gRPC listener.
    const worker = await NestFactory.createApplicationContext(WorkerModule, {
        bufferLogs: true,
    });
    worker.useLogger(worker.get(Logger));
    worker.enableShutdownHooks();
    console.log('📮 Content Service worker running (outbox relay, generation reaper, R2 delete tasks)');
}

async function startApi() {
    const app = await NestFactory.create(ContentServiceModule, {
        bufferLogs: true,
    });
    app.useLogger(app.get(Logger));
    app.enableShutdownHooks();

    // Global prefix to match gateway proxy paths
    app.setGlobalPrefix('api/v1', {
        exclude: HEALTH_ROUTES_EXCLUDED_FROM_PREFIX,
    });

    // Redis outage on an HTTP request => 503 SERVICE_UNAVAILABLE, not 500.
    app.useGlobalFilters(new RedisUnavailableFilter());

    app.enableCors({
        origin: process.env.FRONTEND_URL || [
            'http://localhost:5173',
            'http://localhost:3001',
            'http://127.0.0.1:5173',
        ],
        credentials: true,
    });

    // gRPC server: ContentService (assessment forwards the teacher's user token).
    app.connectMicroservice<MicroserviceOptions>(grpcServerOptions([PROTO_FILES.content]), {
        inheritAppConfig: true,
    });
    await app.startAllMicroservices();

    const port = process.env.PORT ?? 3000;
    const grpcPort = process.env.GRPC_PORT || 50051;
    await app.listen(port);
    console.log(`🚀 Content Service is running on port ${port}`);
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
