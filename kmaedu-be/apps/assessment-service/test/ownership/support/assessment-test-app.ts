import { randomBytes } from 'crypto';
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
import { PrismaService } from '../../../src/prisma';
import { HEALTH_ROUTES_EXCLUDED_FROM_PREFIX } from '@kmaedu/observability';
import { startFakeAuth, type FakeAuth } from './fake-auth';
import { startFakeDocument, type FakeDocument } from './fake-document';
import { join } from 'path';
import { startFakeContent, type ContentBackend, type FakeContent } from './fake-content';

export type TestRole = 'STUDENT' | 'TEACHER' | 'SYSTEM_ADMIN';

export interface TestUser {
    id: string;
    roles: TestRole[];
    av: number;
}

export interface AssessmentTestApp<C extends ContentBackend = FakeContent> {
    app: INestApplication;
    moduleRef: TestingModule;
    server: Server;
    /** assessment's own client (the real one, with the snapshot column omitted like in production). */
    prisma: PrismaService;
    keys: TestKeyPair;
    /** The fake auth directory assessment talks to over real gRPC (call log included). */
    auth: FakeAuth;
    /** The fake document-service (`GetQuota` for the history stats, over real gRPC, with call log). */
    document: FakeDocument;
    /**
     * content-service over real gRPC: a fake with the real contract by default (`FakeContent`), the real
     * service when the cross-app harness passes `options.content`.
     */
    content: C;
    /** Registers a verified account in the fake auth directory and returns it with its token roles. */
    createUser(roles: TestRole[], overrides?: { isVerified?: boolean }): Promise<TestUser>;
    /** Bearer token for `user` (override claims to test stale/unverified tokens). */
    tokenFor(
        user: Pick<TestUser, 'id' | 'roles' | 'av'>,
        opts?: { emailVerified?: boolean; expiresInSeconds?: number }
    ): Promise<string>;
    close(): Promise<void>;
}

export const rid = (): string => randomBytes(6).toString('hex');

export interface BootOptions<C extends ContentBackend> {
    listen?: boolean;
    /** Starts the content backend assessment is pointed at; gets the key pair user tokens are signed with. */
    content?: (keys: TestKeyPair) => Promise<C>;
}

const repoRoot = (): string => join(__dirname, '..', '..', '..', '..', '..');

/**
 * Boots the real AssessmentServiceModule against real Postgres / Redis / RabbitMQ, a fake auth directory and
 * a fake document-service, and a content-service reached over real gRPC (so the shared client, retries,
 * token forwarding and the real guards run).
 *
 *   DATABASE_URL            assessment_svc, `?schema=assessment`
 *   RABBITMQ_URL            broker user `assessment`
 *   RABBITMQ_CONTENT_URL    broker user `content` (publishes content.quizset.deleted in the event specs)
 *   RABBITMQ_AUTH_URL       broker user `auth` (publishes auth.user.updated)
 */
export async function bootAssessmentApp<C extends ContentBackend = FakeContent>(
    options: BootOptions<C> = {}
): Promise<AssessmentTestApp<C>> {
    const originalCwd = process.cwd();
    // Proto/template paths resolve against the repo root (kmaedu-be/).
    process.chdir(repoRoot());
    const auth = await startFakeAuth();
    process.env.AUTH_GRPC_URL = auth.server.url;
    const document = await startFakeDocument();
    process.env.DOCUMENT_GRPC_URL = document.server.url;

    const keys = await createTestKeyPair('own-kid');
    const content = (await (options.content ? options.content(keys) : startFakeContent())) as C;
    process.env.CONTENT_GRPC_URL = content.grpcUrl;

    const { AssessmentServiceModule } = await import('../../../src/assessment-service.module');
    const verifier = createTokenVerifier({
        issuer: TEST_ISSUER,
        audiences: [TEST_AUDIENCE, 'assessment'],
        localJwks: { keys: [keys.publicJwk] },
    });
    const moduleRef = await Test.createTestingModule({ imports: [AssessmentServiceModule] })
        .overrideProvider(TOKEN_VERIFIER)
        .useValue(verifier)
        .overrideProvider(ServiceTokenClient)
        // A real signed `svc:assessment` token per audience: the fakes read the caller from it.
        .useValue({
            getToken: (audience: string) => signTestToken(keys, { claims: serviceClaims('assessment'), audience }),
        })
        .compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: HEALTH_ROUTES_EXCLUDED_FROM_PREFIX });
    await app.init();
    if (options.listen) await app.listen(0);
    const prisma = app.get(PrismaService);

    return {
        app,
        moduleRef,
        server: app.getHttpServer() as Server,
        prisma,
        keys,
        auth,
        document,
        content,
        async createUser(roles) {
            const id = `u_${rid()}`;
            // assessment has no `User` table: the account exists in the fake auth directory only.
            auth.addUser({
                id,
                username: id,
                email: `${id}@own.test`,
                name: `Name ${id}`,
                avatar: '',
            });
            return { id, roles, av: 0 };
        },
        tokenFor(user, opts = {}) {
            return signTestToken(keys, {
                expiresInSeconds: opts.expiresInSeconds,
                claims: {
                    sub: user.id,
                    roles: user.roles,
                    sid: `sid_${user.id}`,
                    email_verified: opts.emailVerified ?? true,
                    av: user.av,
                },
            });
        },
        async close() {
            // Closing right after boot can hang on the RabbitMQ channel teardown.
            await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 5000))]);
            await content.close();
            await auth.server.close();
            await document.close();
            delete process.env.CONTENT_GRPC_URL;
            process.chdir(originalCwd);
        },
    };
}
