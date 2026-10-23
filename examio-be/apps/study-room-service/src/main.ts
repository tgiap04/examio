import { config } from 'dotenv';
import { join } from 'path';

// Load .env file from service directory
config({ path: join(process.cwd(), 'apps', 'study-room-service', '.env') });

import { NestFactory } from '@nestjs/core';
import {
    HEALTH_ROUTES_EXCLUDED_FROM_PREFIX,
    Logger,
} from '@examio/observability';
import { RedisUnavailableFilter } from '@examio/redis';
import { StudyRoomServiceModule } from './study-room-service.module';
import { RedisIoAdapter } from './modules/study-room/redis-io.adapter';

async function bootstrap() {
    // WS gateway dùng cookie auth sameSite=none ở prod: origin allowlist bắt buộc,
    // không được fail-open. Xem wsAllowedOrigins().
    if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
        throw new Error(
            'FRONTEND_URL must be configured in production (WebSocket CORS allowlist). Refusing to start.'
        );
    }

    const app = await NestFactory.create(StudyRoomServiceModule, {
        bufferLogs: true,
    });
    app.useLogger(app.get(Logger));
    // SIGTERM/SIGINT: run the module destroy hooks (focus-time drain, Prisma/Redis close).
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

    // Socket.io + Redis adapter (channel key `studyroom`): fan-out across instances.
    const redisIoAdapter = new RedisIoAdapter(app);
    await redisIoAdapter.connectToRedis();
    app.useWebSocketAdapter(redisIoAdapter);

    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    // Release the adapter's pub/sub connections once the server has closed (SIGTERM drain).
    app.getHttpServer().once('close', () => void redisIoAdapter.dispose());
    console.log(`🚀 Study Room Service is running on port ${port}`);
}

bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
});
