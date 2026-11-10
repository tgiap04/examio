import { randomBytes } from 'crypto';
import { join } from 'path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Server } from 'http';
import { Metadata } from '@grpc/grpc-js';
import { PROTO_FILES, documentV1 } from '@examio/contracts';
import { createTestGrpcClient, startTestGrpcServer, type TestGrpcServer } from '@examio/grpc/testing';
import { ServiceTokenClient, TOKEN_VERIFIER, createTokenVerifier } from '@examio/auth-jwt';
import {
    TEST_AUDIENCE,
    TEST_ISSUER,
    createTestKeyPair,
    serviceClaims,
    signTestToken,
    type TestKeyPair,
} from '@examio/auth-jwt/testing';
import { HEALTH_ROUTES_EXCLUDED_FROM_PREFIX } from '@examio/observability';
import { PrismaService } from '../../src/prisma';
import { startFakeR2, type FakeR2 } from './fake-r2';

export type TestRole = 'STUDENT' | 'TEACHER' | 'SYSTEM_ADMIN';

export interface TestUser {
    id: string;
    roles: TestRole[];
}

export const rid = (): string => randomBytes(6).toString('hex');

export interface DocumentTestApp {
    app: INestApplication;
    moduleRef: TestingModule;
    server: Server;
    prisma: PrismaService;
    keys: TestKeyPair;
    r2: FakeR2;
    /** Real gRPC client of the app's own DocumentService server. */
    grpc: documentV1.DocumentServiceClient;
    /** A teacher (document:upload). */
    teacher(): TestUser;
    user(roles: TestRole[]): TestUser;
    tokenFor(user: TestUser): Promise<string>;
    serviceToken(name: string, audience?: string): Promise<string>;
    /** gRPC metadata carrying the user's access token. */
    md(user: TestUser): Promise<Metadata>;
    close(): Promise<void>;
}

/**
 * Boots the real DocumentServiceModule (real Postgres) as main.ts wires it: `/api/v1` prefix and
 * its gRPC server on a free port. r2 is a REAL gRPC server (a fake with the same contract) so
 * the shared client, retries and the service token are exercised; only the JWKS
 * fetch and the service token are replaced by a local key pair.
 */
export async function bootDocumentApp(): Promise<DocumentTestApp> {
    const originalCwd = process.cwd();
    // Proto paths resolve against the repo root (examio-be/).
    process.chdir(join(__dirname, '..', '..', '..', '..'));
    const r2 = await startFakeR2();
    // Nothing in document-service may need finance-service any more: boot without it.
    process.env.R2_GRPC_URL = r2.server.url;
    process.env.R2_PUBLIC_URL = 'https://r2.test';

    const { DocumentServiceModule } = await import('../../src/document-service.module');
    const keys = await createTestKeyPair('doc-kid');
    const verifier = createTokenVerifier({
        issuer: TEST_ISSUER,
        audiences: [TEST_AUDIENCE, 'document'],
        localJwks: { keys: [keys.publicJwk] },
    });
    const serviceToken = (name: string, audience = 'r2') =>
        signTestToken(keys, { claims: serviceClaims(name), audience });
    const moduleRef = await Test.createTestingModule({ imports: [DocumentServiceModule] })
        .overrideProvider(TOKEN_VERIFIER)
        .useValue(verifier)
        .overrideProvider(ServiceTokenClient)
        .useValue({ getToken: (audience: string) => serviceToken('document', audience) })
        .compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: HEALTH_ROUTES_EXCLUDED_FROM_PREFIX });
    await app.init();
    const grpcServer: TestGrpcServer = await startTestGrpcServer(moduleRef, [PROTO_FILES.document]);
    const grpcClient = createTestGrpcClient(grpcServer.url, [PROTO_FILES.document]);

    const tokenFor = (user: TestUser) =>
        signTestToken(keys, {
            claims: { sub: user.id, roles: user.roles, sid: `sid_${user.id}`, email_verified: true, av: 0 },
        });
    const user = (roles: TestRole[]): TestUser => ({ id: `u_${rid()}`, roles });

    return {
        app,
        moduleRef,
        server: app.getHttpServer() as Server,
        prisma: app.get(PrismaService),
        keys,
        r2,
        grpc: grpcClient.getService<documentV1.DocumentServiceClient>(documentV1.DOCUMENT_SERVICE_NAME),
        user,
        teacher: () => user(['TEACHER']),
        tokenFor,
        serviceToken,
        async md(u) {
            const md = new Metadata();
            md.set('authorization', `Bearer ${await tokenFor(u)}`);
            return md;
        },
        async close() {
            await grpcServer.close();
            await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 5000))]);
            await r2.close();
            process.chdir(originalCwd);
        },
    };
}
