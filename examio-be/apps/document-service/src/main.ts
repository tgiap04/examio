import { config } from 'dotenv';
import { join } from 'path';

// Load .env file from service directory
config({ path: join(process.cwd(), 'apps', 'document-service', '.env') });

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { HEALTH_ROUTES_EXCLUDED_FROM_PREFIX, Logger } from '@examio/observability';
import { PROTO_FILES } from '@examio/contracts';
import { LARGE_MESSAGE_BYTES, grpcServerOptions } from '@examio/grpc';
import { parseRoles } from '@examio/messaging';
import { DocumentServiceModule } from './document-service.module';
import { WorkerModule } from './worker.module';

async function startWorker() {
    // Outbox relay + document.events consumer + PENDING_CHARGE reaper + R2 delete tasks. No listener.
    const worker = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
    worker.useLogger(worker.get(Logger));
    worker.enableShutdownHooks();
    console.log('📮 Document Service worker running (outbox, consumer, reaper, R2 delete tasks)');
}

async function startApi() {
    const app = await NestFactory.create(DocumentServiceModule, { bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.enableShutdownHooks();

    // Global prefix to match gateway proxy paths
    app.setGlobalPrefix('api/v1', { exclude: HEALTH_ROUTES_EXCLUDED_FROM_PREFIX });

    app.enableCors({
        origin: process.env.FRONTEND_URL || [
            'http://localhost:5173',
            'http://localhost:3001',
            'http://127.0.0.1:5173',
        ],
        credentials: true,
    });

    // gRPC server: DocumentService (callers forward the user token). CreateUpload carries the file
    // bytes (up to 50 MB), so the message limit is raised like the r2 client's.
    app.connectMicroservice<MicroserviceOptions>(
        grpcServerOptions([PROTO_FILES.document], LARGE_MESSAGE_BYTES),
        { inheritAppConfig: true }
    );
    await app.startAllMicroservices();

    const port = process.env.PORT ?? 3000;
    const grpcPort = process.env.GRPC_PORT || 50051;
    await app.listen(port);
    console.log(`🚀 Document Service is running on port ${port}`);
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
