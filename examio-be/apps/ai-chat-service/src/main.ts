import { config } from 'dotenv';
import { join } from 'path';
// Load .env file from service directory
config({ path: join(process.cwd(), 'apps', 'ai-chat-service', '.env') });
import { NestFactory } from '@nestjs/core';
import { AIChatServiceModule } from './ai-chat-service.module';
import {
    HEALTH_ROUTES_EXCLUDED_FROM_PREFIX,
    Logger,
} from '@examio/observability';
import { RedisUnavailableFilter } from '@examio/redis';
import { parseRoles } from '@examio/messaging';
import { WorkerModule } from './worker.module';

async function startWorker() {
    // R2 delete-task worker. No HTTP/gRPC listener.
    const worker = await NestFactory.createApplicationContext(WorkerModule, {
        bufferLogs: true,
    });
    worker.useLogger(worker.get(Logger));
    worker.enableShutdownHooks();
    console.log('📮 AI Chat Service worker running (R2 delete tasks)');
}

async function startApi() {
    const app = await NestFactory.create(AIChatServiceModule, {
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

    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    console.log(`🚀 AI Chat Service is running on port ${port}`);
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
