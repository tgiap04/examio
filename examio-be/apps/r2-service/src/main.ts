import { config } from 'dotenv';
import { join } from 'path';

// Load .env file from service directory
config({ path: join(process.cwd(), 'apps', 'r2-service', '.env') });

import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { R2ServiceModule } from './r2-service.module';
import { Logger } from '@examio/observability';

async function bootstrap() {
    // HTTP server for health checks
    const app = await NestFactory.create(R2ServiceModule, {
        bufferLogs: true,
    });
    app.useLogger(app.get(Logger));

    // Use absolute path from process.cwd() for proto file
    const protoPath = join(
        process.cwd(),
        'libs',
        'common',
        'src',
        'protos',
        'r2.proto'
    );
    console.log(`📄 Using proto file: ${protoPath}`);

    // gRPC microservice with increased message size limit for file uploads
    const MAX_MESSAGE_SIZE = 500 * 1024 * 1024; // 50MB limit for file uploads
    app.connectMicroservice<MicroserviceOptions>({
        transport: Transport.GRPC,
        options: {
            package: 'r2',
            protoPath,
            // Match the client: keepCase so snake_case response fields
            // (file_id, key_r2) and request fields (key_r2, expires_in_seconds)
            // serialize instead of being dropped as camelCase mismatches.
            loader: { keepCase: true },
            url: `0.0.0.0:${process.env.GRPC_PORT || 50054}`,
            maxReceiveMessageLength: MAX_MESSAGE_SIZE,
            maxSendMessageLength: MAX_MESSAGE_SIZE,
        },
    });

    await app.startAllMicroservices();
    await app.listen(process.env.PORT ?? 3004);

    console.log(`🚀 R2 Service is running on port ${process.env.PORT ?? 3004}`);
    console.log(
        `📡 gRPC server is running on port ${process.env.GRPC_PORT || 50054}`
    );
}
bootstrap();
