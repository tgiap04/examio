import { config } from 'dotenv';
import { join } from 'path';

// Load .env file from service directory
config({ path: join(process.cwd(), 'apps', 'r2-service', '.env') });

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { R2ServiceModule } from './r2-service.module';
import { Logger } from '@kmaedu/observability';
import { PROTO_FILES } from '@kmaedu/contracts';
import { grpcServerOptions, LARGE_MESSAGE_BYTES } from '@kmaedu/grpc';

async function bootstrap() {
    // HTTP server for health checks
    const app = await NestFactory.create(R2ServiceModule, {
        bufferLogs: true,
    });
    app.useLogger(app.get(Logger));

    // gRPC microservice (generated contracts, proto root resolved at runtime).
    // Larger message limit for file uploads.
    app.connectMicroservice<MicroserviceOptions>(
        grpcServerOptions([PROTO_FILES.r2], LARGE_MESSAGE_BYTES),
        { inheritAppConfig: true }
    );

    await app.startAllMicroservices();
    const httpPort = process.env.PORT ?? 3000;
    const grpcPort = process.env.GRPC_PORT || 50051;
    await app.listen(httpPort);

    console.log(`🚀 R2 Service is running on port ${httpPort}`);
    console.log(`📡 gRPC server is running on port ${grpcPort}`);
}
bootstrap();
