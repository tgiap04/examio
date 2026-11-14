import { config } from 'dotenv';
import { join } from 'path';

// Load .env file from service directory
config({ path: join(process.cwd(), 'apps', 'gateway-service', '.env') });

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@kmaedu/observability';
import { PROTO_FILES } from '@kmaedu/contracts';
import { grpcServerOptions } from '@kmaedu/grpc';
import { GatewayModule } from './gateway.module';
import { configureGatewayApp } from './app-setup';

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(GatewayModule, {
        bufferLogs: true,
        // Bodies are streamed to the upstream, never parsed here.
        bodyParser: false,
    });
    app.useLogger(app.get(Logger));
    app.enableShutdownHooks();

    const onUpgrade = configureGatewayApp(app);

    // GatewayControl (auth/admin -> gateway) on GRPC_PORT, internal network only.
    app.connectMicroservice<MicroserviceOptions>(
        grpcServerOptions([PROTO_FILES.gatewayControl]),
        { inheritAppConfig: true }
    );
    await app.startAllMicroservices();

    const port = process.env.PORT || 3000;
    await app.listen(port);
    app.getHttpServer().on('upgrade', onUpgrade);

    console.log(`🚀 Gateway running on port ${port}`);
    console.log(`🔌 GatewayControl gRPC on port ${process.env.GRPC_PORT || '50051'}`);
}
bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
});
