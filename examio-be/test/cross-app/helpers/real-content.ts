import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Server } from 'http';
import { createTokenVerifier, ServiceTokenClient, TOKEN_VERIFIER } from '@examio/auth-jwt';
import {
    TEST_AUDIENCE,
    TEST_ISSUER,
    serviceClaims,
    signTestToken,
    type TestKeyPair,
} from '@examio/auth-jwt/testing';
import { PROTO_FILES } from '@examio/contracts';
import { startTestGrpcServer, type TestGrpcServer } from '@examio/grpc/testing';
import { HEALTH_ROUTES_EXCLUDED_FROM_PREFIX } from '@examio/observability';
import type { ContentBackend } from '../../../apps/assessment-service/test/ownership/support/fake-content';
import type { PrismaService as ContentPrisma } from '../../../apps/content-service/src/prisma';

/**
 * The REAL content-service (its module, its Postgres schema, its gRPC server), booted in the test process so
 * assessment talks to it over the wire exactly like in production. It shares the key pair of the assessment
 * app: one user token is valid in both.
 */
export interface RealContent extends ContentBackend {
    app: INestApplication;
    moduleRef: TestingModule;
    server: Server;
    prisma: ContentPrisma;
    grpc: TestGrpcServer;
}

/** Runs `fn` with `values` in `process.env` (the libs read them while a module is built / initialised). */
async function withEnv<T>(values: Record<string, string>, fn: () => Promise<T>): Promise<T> {
    const previous = Object.fromEntries(Object.keys(values).map((k) => [k, process.env[k]]));
    Object.assign(process.env, values);
    try {
        return await fn();
    } finally {
        for (const [k, v] of Object.entries(previous)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
}

export async function startRealContent(
    keys: TestKeyPair,
    env: { databaseUrl: string; rabbitmqUrl: string }
): Promise<RealContent> {
    // content's clients to document / r2 / vocabulary / ai connect lazily and are not used by the
    // quiz-set paths assessment exercises: the placeholders only have to exist.
    const placeholders = {
        DOCUMENT_GRPC_URL: '127.0.0.1:1',
        R2_GRPC_URL: '127.0.0.1:1',
        VOCABULARY_GRPC_URL: '127.0.0.1:1',
        AI_GRPC_URL: '127.0.0.1:1',
    };
    const { ContentServiceModule } = await import('../../../apps/content-service/src/content-service.module');
    const { PrismaService } = await import('../../../apps/content-service/src/prisma');
    const verifier = createTokenVerifier({
        issuer: TEST_ISSUER,
        audiences: [TEST_AUDIENCE, 'content'],
        localJwks: { keys: [keys.publicJwk] },
    });
    const moduleRef = await withEnv({ ...placeholders, DATABASE_URL: env.databaseUrl }, () =>
        Test.createTestingModule({ imports: [ContentServiceModule] })
            .overrideProvider(TOKEN_VERIFIER)
            .useValue(verifier)
            .overrideProvider(ServiceTokenClient)
            .useValue({
                getToken: (audience: string) => signTestToken(keys, { claims: serviceClaims('content'), audience }),
            })
            .compile()
    );
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: HEALTH_ROUTES_EXCLUDED_FROM_PREFIX });
    await withEnv({ RABBITMQ_URL: env.rabbitmqUrl }, () => app.init());
    const grpc = await startTestGrpcServer(moduleRef, [PROTO_FILES.content]);
    return {
        app,
        moduleRef,
        server: app.getHttpServer() as Server,
        prisma: app.get(PrismaService),
        grpc,
        grpcUrl: grpc.url,
        async close() {
            await grpc.close().catch(() => undefined);
            await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 5000))]);
        },
    };
}
