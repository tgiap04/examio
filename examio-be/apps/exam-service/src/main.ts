import { config } from 'dotenv';
import { join } from 'path';

// Load .env file from service directory
config({ path: join(process.cwd(), 'apps', 'exam-service', '.env') });

import { NestFactory } from '@nestjs/core';
import { ExamServiceModule } from './exam-service.module';
import { RedisIoAdapter } from './modules/study-room/redis-io.adapter';

async function bootstrap() {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        throw new Error(
            'JWT_SECRET is missing or too short (must be >= 32 characters). Refusing to start.'
        );
    }

    // WS gateway (study-room) dùng cookie auth sameSite=none ở prod — origin
    // allowlist bắt buộc, không được fail-open. Xem wsAllowedOrigins().
    if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
        throw new Error(
            'FRONTEND_URL must be configured in production (WebSocket CORS allowlist). Refusing to start.'
        );
    }

    const app = await NestFactory.create(ExamServiceModule);

    // Global prefix to match gateway proxy paths
    app.setGlobalPrefix('api/v1');

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

    const port = process.env.PORT ?? 3002;
    await app.listen(port);
    console.log(`🚀 Exam Service is running on port ${port}`);
}
bootstrap();
