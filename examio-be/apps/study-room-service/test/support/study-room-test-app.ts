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
import { HEALTH_ROUTES_EXCLUDED_FROM_PREFIX } from '@examio/observability';
import { PrismaService } from '../../src/prisma';
import { startFakeAuth, type FakeAuth } from './fake-auth';

export type TestRole = 'STUDENT' | 'TEACHER' | 'SYSTEM_ADMIN';

export interface TestUser {
    id: string;
    roles: TestRole[];
    av: number;
}

export interface StudyRoomTestApp {
    app: INestApplication;
    server: Server;
    prisma: PrismaService;
    keys: TestKeyPair;
    /** The fake auth directory study-room talks to over real gRPC (call log included). */
    auth: FakeAuth;
    /** Registers an account in the fake auth directory and returns it with its token roles. */
    createUser(roles: TestRole[]): Promise<TestUser>;
    /** Bearer token for `user` (override claims to test stale/unverified/short-lived tokens). */
    tokenFor(
        user: Pick<TestUser, 'id' | 'roles' | 'av'>,
        opts?: { emailVerified?: boolean; expiresInSeconds?: number }
    ): Promise<string>;
    close(): Promise<void>;
}

export const rid = (): string => randomBytes(6).toString('hex');

/**
 * Boots the real StudyRoomServiceModule (real Postgres, Redis, RabbitMQ consumer)
 * exactly as main.ts wires it: `/api/v1` prefix, Redis Socket.io adapter. Only the
 * JWKS fetch and the auth service are replaced (local key pair, fake auth gRPC).
 * Every run owns throwaway ids, so no per-test reset is needed.
 */
export async function bootStudyRoomApp(
    options: { listen?: boolean } = {}
): Promise<StudyRoomTestApp> {
    const originalCwd = process.cwd();
    // Proto paths resolve against the repo root (examio-be/).
    process.chdir(join(__dirname, '..', '..', '..', '..'));
    // Profiles come from auth over gRPC: point at a fake directory BEFORE the
    // module is evaluated (the gRPC client reads the URL then).
    const auth = await startFakeAuth();
    process.env.AUTH_GRPC_URL = auth.server.url;
    const { StudyRoomServiceModule } = await import(
        '../../src/study-room-service.module'
    );
    const { RedisIoAdapter } = await import(
        '../../src/modules/study-room/redis-io.adapter'
    );
    const keys = await createTestKeyPair('sr-kid');
    const verifier = createTokenVerifier({
        issuer: TEST_ISSUER,
        audiences: [TEST_AUDIENCE, 'studyroom'],
        localJwks: { keys: [keys.publicJwk] },
    });
    const moduleRef = await Test.createTestingModule({
        imports: [StudyRoomServiceModule],
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
    const adapter = new RedisIoAdapter(app);
    await adapter.connectToRedis();
    app.useWebSocketAdapter(adapter);
    await app.init();
    if (options.listen) await app.listen(0);

    return {
        app,
        server: app.getHttpServer() as Server,
        prisma: app.get(PrismaService),
        keys,
        auth,
        async createUser(roles) {
            const id = `u_${rid()}`;
            // study-room has no `User` table: the account exists in the fake auth directory only.
            auth.addUser({
                id,
                username: id,
                email: `${id}@sr.test`,
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
            await adapter.dispose();
            await auth.server.close();
            process.chdir(originalCwd);
        },
    };
}
