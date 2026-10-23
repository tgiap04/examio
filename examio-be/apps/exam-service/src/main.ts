import { config } from 'dotenv';
import { join } from 'path';

// Load .env file from service directory
config({ path: join(process.cwd(), 'apps', 'exam-service', '.env') });

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { ExamServiceModule } from './exam-service.module';
import {
    HEALTH_ROUTES_EXCLUDED_FROM_PREFIX,
    Logger,
} from '@examio/observability';
import { RedisUnavailableFilter } from '@examio/redis';
import { PROTO_FILES } from '@examio/contracts';
import { grpcServerOptions } from '@examio/grpc';
import { RedisIoAdapter } from './modules/study-room/redis-io.adapter';
import { parseRoles } from '@examio/messaging';
import { WorkerModule } from './worker.module';

async function startWorker() {
    // R2 delete-task worker. No HTTP/gRPC listener.
    const worker = await NestFactory.createApplicationContext(WorkerModule, {
        bufferLogs: true,
    });
    worker.useLogger(worker.get(Logger));
    worker.enableShutdownHooks();
    console.log('📮 Exam Service worker running (R2 delete tasks)');
}

async function startApi() {
    // WS gateway (study-room) dùng cookie auth sameSite=none ở prod — origin
    // allowlist bắt buộc, không được fail-open. Xem wsAllowedOrigins().
    if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
        throw new Error(
            'FRONTEND_URL must be configured in production (WebSocket CORS allowlist). Refusing to start.'
        );
    }

    const app = await NestFactory.create(ExamServiceModule, {
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

    // WebSocket cho phòng học chung: Socket.io + Redis adapter (fan-out đa instance).
    const redisIoAdapter = new RedisIoAdapter(app);
    await redisIoAdapter.connectToRedis();
    app.useWebSocketAdapter(redisIoAdapter);

    // gRPC server: WordFamilyAdminService (admin-service forwards the admin token).
    app.connectMicroservice<MicroserviceOptions>(
        grpcServerOptions([PROTO_FILES.wordFamilyAdmin]),
        { inheritAppConfig: true }
    );
    await app.startAllMicroservices();

    const port = process.env.PORT ?? 3000;
    const grpcPort = process.env.GRPC_PORT || 50051;
    await app.listen(port);
    console.log(`🚀 Exam Service is running on port ${port}`);
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
