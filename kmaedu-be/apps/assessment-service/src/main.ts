import { config } from 'dotenv';
import { join } from 'path';

// Load .env file from service directory
config({ path: join(process.cwd(), 'apps', 'assessment-service', '.env') });

import { NestFactory } from '@nestjs/core';
import { AssessmentServiceModule } from './assessment-service.module';
import {
    HEALTH_ROUTES_EXCLUDED_FROM_PREFIX,
    Logger,
} from '@kmaedu/observability';
import { RedisUnavailableFilter } from '@kmaedu/redis';
import { parseRoles } from '@kmaedu/messaging';
import { WorkerModule } from './worker.module';

async function startWorker() {
    // Outbox relay. No HTTP/gRPC listener.
    const worker = await NestFactory.createApplicationContext(WorkerModule, {
        bufferLogs: true,
    });
    worker.useLogger(worker.get(Logger));
    worker.enableShutdownHooks();
    console.log('📮 Assessment Service worker running (outbox relay)');
}

async function startApi() {
    const app = await NestFactory.create(AssessmentServiceModule, {
        bufferLogs: true,
    });
    app.useLogger(app.get(Logger));

    // Global prefix to match gateway proxy paths
    app.setGlobalPrefix('api/v1', {
        exclude: HEALTH_ROUTES_EXCLUDED_FROM_PREFIX,
    });

    // Redis outage on an HTTP request => 503 SERVICE_UNAVAILABLE, not 500.
    app.useGlobalFilters(new RedisUnavailableFilter());

    // Enable CORS
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
    console.log(`🚀 Assessment Service is running on port ${port}`);
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
