import { randomBytes } from 'crypto';
import { join } from 'path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import {
    createTokenVerifier,
    ServiceTokenClient,
    TOKEN_VERIFIER,
} from '@examio/auth-jwt';
import {
    TEST_AUDIENCE,
    TEST_ISSUER,
    createTestKeyPair,
    signTestToken,
    type TestKeyPair,
} from '@examio/auth-jwt/testing';
import { PrismaService } from '../../../src/prisma';
import { HEALTH_ROUTES_EXCLUDED_FROM_PREFIX } from '@examio/observability';
import { startFakeAuth, type FakeAuth } from './fake-auth';

export type TestRole = 'STUDENT' | 'TEACHER' | 'SYSTEM_ADMIN';

export interface TestUser {
    id: string;
    roles: TestRole[];
    av: number;
}

export interface ExamTestApp {
    app: INestApplication;
    server: Server;
    prisma: PrismaService;
    keys: TestKeyPair;
    /** The fake auth directory exam talks to over real gRPC (call log included). */
    auth: FakeAuth;
    /** Registers a verified account in the fake auth directory and returns it with its token roles. */
    createUser(
        roles: TestRole[],
        overrides?: { isVerified?: boolean }
    ): Promise<TestUser>;
    /** Bearer token for `user` (override claims to test stale/unverified tokens). */
    tokenFor(
        user: Pick<TestUser, 'id' | 'roles' | 'av'>,
        opts?: { emailVerified?: boolean; expiresInSeconds?: number }
    ): Promise<string>;
    close(): Promise<void>;
}

export const rid = (): string => randomBytes(6).toString('hex');

/** Throwaway ids: every spec run owns its own rows (no per-test reset needed). */
export async function bootExamApp(
    options: { listen?: boolean; redisAdapter?: boolean } = {}
): Promise<ExamTestApp> {
    const originalCwd = process.cwd();
    // Proto/template paths resolve against the repo root (examio-be/).
    process.chdir(join(__dirname, '..', '..', '..', '..', '..'));
    // exam resolves names/avatars through auth over gRPC: point it at a fake
    // directory BEFORE the module is evaluated (the gRPC client reads the URL then).
    const auth = await startFakeAuth();
    process.env.AUTH_GRPC_URL = auth.server.url;
    const { ExamServiceModule } =
        await import('../../../src/exam-service.module');
    const keys = await createTestKeyPair('own-kid');
    const verifier = createTokenVerifier({
        issuer: TEST_ISSUER,
        audiences: [TEST_AUDIENCE, 'exam'],
        localJwks: { keys: [keys.publicJwk] },
    });
    const moduleRef = await Test.createTestingModule({
        imports: [ExamServiceModule],
    })
        .overrideProvider(TOKEN_VERIFIER)
        .useValue(verifier)
        .overrideProvider(ServiceTokenClient)
        .useValue({ getToken: async () => 'e2e-service-token' })
        .compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', {
        exclude: HEALTH_ROUTES_EXCLUDED_FROM_PREFIX,
    });
    let adapter: { dispose(): Promise<void> } | undefined;
    if (options.redisAdapter) {
        const { RedisIoAdapter } =
            await import('../../../src/modules/study-room/redis-io.adapter');
        const redisAdapter = new RedisIoAdapter(app);
        adapter = redisAdapter;
        await redisAdapter.connectToRedis();
        app.useWebSocketAdapter(redisAdapter);
    }
    await app.init();
    if (options.listen) await app.listen(0);
    const prisma = app.get(PrismaService);

    return {
        app,
        server: app.getHttpServer() as Server,
        prisma,
        keys,
        auth,
        async createUser(roles, overrides = {}) {
            const id = `u_${rid()}`;
            // exam has no `User` table: the account exists in the fake auth directory only.
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
            await Promise.race([
                app.close(),
                new Promise((resolve) => setTimeout(resolve, 5000)),
            ]);
            await adapter?.dispose();
            await auth.server.close();
            process.chdir(originalCwd);
        },
    };
}
