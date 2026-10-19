import { config } from 'dotenv';
import { join } from 'path';

// Load .env file from service directory
config({ path: join(process.cwd(), 'apps', 'auth-service', '.env') });

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { AuthServiceModule } from './auth-service.module';
import {
    HEALTH_ROUTES_EXCLUDED_FROM_PREFIX,
    Logger,
} from '@examio/observability';
import { PROTO_FILES } from '@examio/contracts';
import { grpcServerOptions } from '@examio/grpc';
import { HttpErrorEnvelopeFilter } from '@examio/http';
import { parseRoles } from '@examio/messaging';
import * as cookieParser from 'cookie-parser';
import { WorkerModule } from './worker.module';
import { AUTH_UNPREFIXED_ROUTES } from './token/unprefixed-routes';

async function startWorker() {
    // Outbox relay + purge. No HTTP/gRPC listener.
    const worker = await NestFactory.createApplicationContext(WorkerModule, {
        bufferLogs: true,
    });
    worker.useLogger(worker.get(Logger));
    worker.enableShutdownHooks();
    console.log('📮 Auth Service worker running (outbox relay)');
}

async function startApi() {
    // The RS256 key (JWT_PRIVATE_KEY/JWT_KID) and SERVICE_CLIENTS are validated
    // at boot by TokenService / ServiceTokenController: a service that cannot
    // sign, or has no client registry, refuses to start.

    // Fail fast on misconfiguration: refresh tokens are encrypted at rest
    // with this key (RefreshTokenCipherService). A missing or weak key
    // would either crash on first use or weaken the at-rest protection.
    if (
        !process.env.REFRESH_TOKEN_ENC_KEY ||
        process.env.REFRESH_TOKEN_ENC_KEY.length < 32
    ) {
        throw new Error(
            'REFRESH_TOKEN_ENC_KEY is missing or too short (minimum 32 characters required)'
        );
    }

    // Create HTTP application
    const app = await NestFactory.create(AuthServiceModule, {
        bufferLogs: true,
    });
    app.useLogger(app.get(Logger));

    // Trust the first hop (gateway) so req.ip/req.ips reflect the real
    // client IP from a trusted proxy chain rather than a client-spoofable
    // X-Forwarded-For header read directly off the request.
    app.getHttpAdapter().getInstance().set('trust proxy', 1);

    app.use(cookieParser());

    // `{ statusCode, code, message, requestId }`. Inherited by the gRPC server
    // below; the filter leaves non-HTTP contexts to Nest's own RPC mapping.
    app.useGlobalFilters(new HttpErrorEnvelopeFilter());

    // Global prefix to match gateway proxy paths
    // JWKS and the internal service-token endpoint live outside `api/v1`; the
    // gateway never routes either.
    app.setGlobalPrefix('api/v1', {
        exclude: [
            ...HEALTH_ROUTES_EXCLUDED_FROM_PREFIX,
            ...AUTH_UNPREFIXED_ROUTES,
        ],
    });

    // Enable CORS
    app.enableCors({
        origin: process.env.FRONTEND_URL || [
            'http://localhost:5173',
            'http://localhost:3001',
            'http://127.0.0.1:5173',
        ],
        credentials: true,
    });

    // Connect gRPC microservice
    const grpcPort = process.env.GRPC_PORT || '50051';
    app.connectMicroservice<MicroserviceOptions>(
        grpcServerOptions([PROTO_FILES.auth]),
        { inheritAppConfig: true }
    );

    // Start all microservices
    await app.startAllMicroservices();

    // Start HTTP server
    const httpPort = process.env.PORT || 3000;
    await app.listen(httpPort);

    console.log(`🚀 Auth Service HTTP running on port ${httpPort}`);
    console.log(`🔌 Auth Service gRPC running on port ${grpcPort}`);
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
