import { randomBytes } from 'crypto';
import { join } from 'path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import { PROTO_FILES } from '@kmaedu/contracts';
import {
    createTestGrpcClient,
    startTestGrpcServer,
    type TestGrpcServer,
} from '@kmaedu/grpc/testing';
import {
    createTokenVerifier,
    ServiceTokenClient,
    TOKEN_VERIFIER,
} from '@kmaedu/auth-jwt';
import {
    TEST_AUDIENCE,
    TEST_ISSUER,
    createTestKeyPair,
    signTestToken,
    type TestKeyPair,
} from '@kmaedu/auth-jwt/testing';
import { HEALTH_ROUTES_EXCLUDED_FROM_PREFIX } from '@kmaedu/observability';
import { wordFamilyAdminV1, wordFamilyV1 } from '@kmaedu/contracts';
import { PrismaService } from '../../src/prisma';
import { startFakeAiService, type FakeAiService } from './fake-ai-service';

export type TestRole = 'STUDENT' | 'TEACHER' | 'SYSTEM_ADMIN';

export interface TestUser {
    id: string;
    roles: TestRole[];
    av: number;
}

export interface VocabularyTestApp {
    app: INestApplication;
    server: Server;
    prisma: PrismaService;
    keys: TestKeyPair;
    ai: FakeAiService;
    /** Real gRPC clients of the app's own server (WordFamilyAdminService + WordFamilyService). */
    grpc: {
        admin: wordFamilyAdminV1.WordFamilyAdminServiceClient;
        lookup: wordFamilyV1.WordFamilyServiceClient;
    };
    createUser(roles: TestRole[]): TestUser;
    tokenFor(user: Pick<TestUser, 'id' | 'roles' | 'av'>, opts?: { audience?: string }): Promise<string>;
    close(): Promise<void>;
}

export const rid = (): string => randomBytes(6).toString('hex');

/**
 * Boots the real VocabularyServiceModule (real Postgres + Redis) as main.ts wires
 * it: `/api/v1` prefix, plus its gRPC server on a free port. Only the JWKS fetch,
 * the service token and ai-service are replaced (local key pair, fake token, a
 * grpc-js fake AiService behind the real `AiClient`).
 */
export async function bootVocabularyApp(): Promise<VocabularyTestApp> {
    const originalCwd = process.cwd();
    // Proto paths resolve against the repo root (kmaedu-be/).
    process.chdir(join(__dirname, '..', '..', '..', '..'));
    const ai = await startFakeAiService();
    process.env.AI_GRPC_URL = ai.url;
    const { VocabularyServiceModule } = await import('../../src/vocabulary-service.module');
    const keys = await createTestKeyPair('voc-kid');
    const verifier = createTokenVerifier({
        issuer: TEST_ISSUER,
        audiences: [TEST_AUDIENCE, 'vocabulary'],
        localJwks: { keys: [keys.publicJwk] },
    });
    const moduleRef = await Test.createTestingModule({ imports: [VocabularyServiceModule] })
        .overrideProvider(TOKEN_VERIFIER)
        .useValue(verifier)
        .overrideProvider(ServiceTokenClient)
        .useValue({ getToken: async () => 'e2e-service-token' })
        .compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: HEALTH_ROUTES_EXCLUDED_FROM_PREFIX });
    await app.init();
    const grpcServer: TestGrpcServer = await startTestGrpcServer(moduleRef, [
        PROTO_FILES.wordFamilyAdmin,
        PROTO_FILES.wordFamily,
    ]);
    const grpcClient = createTestGrpcClient(grpcServer.url, [
        PROTO_FILES.wordFamilyAdmin,
        PROTO_FILES.wordFamily,
    ]);

    return {
        app,
        server: app.getHttpServer() as Server,
        prisma: app.get(PrismaService),
        keys,
        ai,
        grpc: {
            admin: grpcClient.getService<wordFamilyAdminV1.WordFamilyAdminServiceClient>(
                wordFamilyAdminV1.WORD_FAMILY_ADMIN_SERVICE_NAME
            ),
            lookup: grpcClient.getService<wordFamilyV1.WordFamilyServiceClient>(
                wordFamilyV1.WORD_FAMILY_SERVICE_NAME
            ),
        },
        createUser: (roles) => ({ id: `u_${rid()}`, roles, av: 0 }),
        tokenFor(user, opts = {}) {
            return signTestToken(keys, {
                audience: opts.audience,
                claims: {
                    sub: user.id,
                    roles: user.roles,
                    sid: `sid_${user.id}`,
                    email_verified: true,
                    av: user.av,
                },
            });
        },
        async close() {
            await grpcServer.close();
            await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 5000))]);
            await ai.close();
            process.chdir(originalCwd);
        },
    };
}
