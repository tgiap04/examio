import { randomBytes } from 'crypto';
import { join } from 'path';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Server } from 'http';
import { createTokenVerifier, ServiceTokenClient, TOKEN_VERIFIER } from '@kmaedu/auth-jwt';
import {
    TEST_AUDIENCE,
    TEST_ISSUER,
    createTestKeyPair,
    serviceClaims,
    signTestToken,
    type TestKeyPair,
} from '@kmaedu/auth-jwt/testing';
import { HEALTH_ROUTES_EXCLUDED_FROM_PREFIX } from '@kmaedu/observability';
import { RedisService } from '@kmaedu/redis';
import { PrismaService } from '../../src/prisma';
import { startFakeAi, type FakeAi } from './fake-ai';
import { startFakeDocument, type FakeDocument } from './fake-document';
import { startFakeR2, type FakeR2 } from './fake-r2';

export type TestRole = 'STUDENT' | 'TEACHER' | 'SYSTEM_ADMIN';

export interface TestUser {
    id: string;
    roles: TestRole[];
    av: number;
}

export interface AiChatTestApp {
    app: INestApplication;
    moduleRef: TestingModule;
    server: Server;
    /** `http://127.0.0.1:<port>` (the app is listening: SSE needs a real socket). */
    baseUrl: string;
    prisma: PrismaService;
    redis: RedisService;
    keys: TestKeyPair;
    /** ai-service over real gRPC (Query, StreamChat; service token `svc:ai-chat` only). */
    ai: FakeAi;
    /** document-service over real gRPC (user token only, owner-scoped, with call log). */
    document: FakeDocument;
    /** r2-service over real gRPC (DeleteObjects as the worker). */
    r2: FakeR2;
    /** The public base of R2 objects the app was started with. */
    r2PublicBase: string;
    createUser(roles: TestRole[]): TestUser;
    tokenFor(user: Pick<TestUser, 'id' | 'roles' | 'av'>): Promise<string>;
    /** Signs a service token for `name` / `audience` with the app's key (what auth would hand out). */
    serviceToken(name: string, audience: string): Promise<string>;
    close(): Promise<void>;
}

export const rid = (): string => randomBytes(6).toString('hex');

export interface BootOptions {
    /** `user`: the app asks for its service token and gets a USER token (misconfiguration), to prove it is refused. */
    serviceToken?: 'service' | 'user';
}

/**
 * Boots the real AIChatServiceModule (real Postgres, Redis and RabbitMQ) as main.ts wires it, with
 * real gRPC fakes for ai-service, document-service and r2, so the shared clients, token
 * forwarding and stream handling are exercised end to end. Only the JWKS fetch and the service-token
 * fetch are replaced (a local key pair).
 */
export async function bootAiChatApp(options: BootOptions = {}): Promise<AiChatTestApp> {
    const originalCwd = process.cwd();
    // Proto paths resolve against the repo root (kmaedu-be/).
    process.chdir(join(__dirname, '..', '..', '..', '..'));
    const [ai, document, r2] = await Promise.all([startFakeAi(), startFakeDocument(), startFakeR2()]);
    process.env.AI_GRPC_URL = ai.server.url;
    process.env.DOCUMENT_GRPC_URL = document.server.url;
    // Nothing in ai-chat may need finance-service any more: boot without it.
    process.env.R2_GRPC_URL = r2.server.url;
    const r2PublicBase = 'https://r2.test.kmaedu.local';
    process.env.R2_PUBLIC_URL = r2PublicBase;
    const { AIChatServiceModule } = await import('../../src/ai-chat-service.module');
    const keys = await createTestKeyPair('aichat-kid');
    const verifier = createTokenVerifier({
        issuer: TEST_ISSUER,
        audiences: [TEST_AUDIENCE, 'ai-chat'],
        localJwks: { keys: [keys.publicJwk] },
    });
    const serviceToken = (name: string, audience: string) => signTestToken(keys, { claims: serviceClaims(name), audience });
    const tokenFor: AiChatTestApp['tokenFor'] = (user) =>
        signTestToken(keys, {
            claims: { sub: user.id, roles: user.roles, sid: `sid_${user.id}`, email_verified: true, av: user.av },
        });
    const moduleRef = await Test.createTestingModule({ imports: [AIChatServiceModule] })
        .overrideProvider(TOKEN_VERIFIER)
        .useValue(verifier)
        .overrideProvider(ServiceTokenClient)
        .useValue({
            getToken: (audience: string) =>
                options.serviceToken === 'user'
                    ? signTestToken(keys, { claims: { sub: 'u_misconfigured', roles: ['TEACHER'] }, audience })
                    : serviceToken('ai-chat', audience),
        })
        .compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: HEALTH_ROUTES_EXCLUDED_FROM_PREFIX });
    await app.init();
    await app.listen(0, '127.0.0.1');
    const server = app.getHttpServer() as Server;
    const address = server.address() as { port: number };

    return {
        app,
        moduleRef,
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
        prisma: app.get(PrismaService),
        redis: app.get(RedisService),
        keys,
        ai,
        document,
        r2,
        r2PublicBase,
        createUser: (roles) => ({ id: `u_${rid()}`, roles, av: 0 }),
        tokenFor,
        serviceToken,
        async close() {
            // Closing right after boot can hang on the RabbitMQ channel teardown.
            await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 5000))]);
            await Promise.all([ai.close(), document.close(), r2.close()]);
            process.chdir(originalCwd);
        },
    };
}
