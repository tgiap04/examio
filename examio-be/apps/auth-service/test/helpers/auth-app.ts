import { createHash, generateKeyPairSync, randomBytes } from 'crypto';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as cookieParser from 'cookie-parser';
import { ThrottlerStorage } from '@nestjs/throttler';
import * as request from 'supertest';
import { PROTO_FILES } from '@examio/contracts';
import { grpcServerOptions } from '@examio/grpc';
import { HEALTH_ROUTES_EXCLUDED_FROM_PREFIX } from '@examio/observability';

export const SERVICE_SECRETS = {
    exam: `exam-${randomBytes(8).toString('hex')}`,
    finance: `finance-${randomBytes(8).toString('hex')}`,
    admin: `admin-${randomBytes(8).toString('hex')}`,
};

export interface AuthApp {
    app: INestApplication;
    prisma: PrismaClient;
    /** http://127.0.0.1:<port> */
    url: string;
    grpcUrl?: string;
    close(): Promise<void>;
}

/** Test env that does not depend on the shell: RS256 key + service clients. */
function ensureEnv(): void {
    if (!process.env.JWT_PRIVATE_KEY) {
        const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
        process.env.JWT_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
        process.env.JWT_KID = 'e2e-kid';
    }
    process.env.JWT_ISSUER ??= 'examio-auth';
    process.env.JWT_AUDIENCE ??= 'examio';
    process.env.SERVICE_CLIENTS = JSON.stringify(
        Object.fromEntries(
            Object.entries(SERVICE_SECRETS).map(([name, secret]) => [
                name,
                createHash('sha256').update(secret).digest('hex'),
            ])
        )
    );
    process.env.REFRESH_TOKEN_ENC_KEY ??= 'e2e-refresh-key-0123456789abcdef0123456789';
    process.env.ADMIN_EMAILS = '';
}

/**
 * Boots the REAL auth-service module (HTTP, optional gRPC) against the local
 * Postgres/Redis/RabbitMQ from the env. Needs the migrations applied.
 */
export async function bootAuthApp(options: { grpc?: boolean; realThrottle?: boolean } = {}): Promise<AuthApp> {
    ensureEnv();
    const originalCwd = process.cwd();
    // Proto/template paths resolve against examio-be/.
    process.chdir(join(__dirname, '..', '..', '..', '..'));
    const { AuthServiceModule } = await import('../../src/auth-service.module');
    const { AUTH_UNPREFIXED_ROUTES } = await import('../../src/token/unprefixed-routes');

    // Rate limits (5/min per IP on register/login) would throttle the suites;
    // the throttler itself is not under test here.
    const noLimit = {
        increment: async () => ({ totalHits: 1, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 }),
    };
    const builder = Test.createTestingModule({ imports: [AuthServiceModule] });
    // `realThrottle` keeps the real storage for the suites that exercise the limits.
    const moduleRef = await (options.realThrottle
        ? builder
        : builder.overrideProvider(ThrottlerStorage).useValue(noLimit)
    ).compile();
    const app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1', {
        exclude: [...HEALTH_ROUTES_EXCLUDED_FROM_PREFIX, ...AUTH_UNPREFIXED_ROUTES],
    });

    let grpcUrl: string | undefined;
    if (options.grpc) {
        const port = 50000 + Math.floor(Math.random() * 10000);
        process.env.GRPC_PORT = String(port);
        app.connectMicroservice(grpcServerOptions([PROTO_FILES.auth, PROTO_FILES.authUsers]), { inheritAppConfig: true });
        await app.startAllMicroservices();
        grpcUrl = `127.0.0.1:${port}`;
    }
    await app.listen(0, '127.0.0.1');
    const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    const prisma = new PrismaClient();

    return {
        app,
        prisma,
        url,
        grpcUrl,
        close: async () => {
            await prisma.$disconnect();
            // Closing right after boot can hang on the RabbitMQ channel teardown.
            await Promise.race([app.close(), new Promise((r) => setTimeout(r, 5000))]);
            process.chdir(originalCwd);
        },
    };
}

let counter = 0;
export const uniq = (prefix: string) =>
    `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${randomBytes(2).toString('hex')}`;

export const PASSWORD = 'Passw0rd!x';

/** Registers through HTTP and returns the response pieces. */
export async function registerUser(ctx: AuthApp, name = uniq('u')) {
    const email = `${name}@e2e.test`;
    const res = await request(ctx.url)
        .post('/api/v1/auth/register')
        .set('x-device-id', `dev-${name}`)
        .send({ username: name, email, password: PASSWORD });
    return { res, email, username: name, id: res.body?.user?.id as string };
}

/** Marks the email verified directly and logs in, returning the fresh tokens. */
export async function loginVerified(ctx: AuthApp, email: string) {
    await ctx.prisma.user.update({ where: { email }, data: { isVerified: true } });
    return request(ctx.url)
        .post('/api/v1/auth/login')
        .set('x-device-id', `dev-login-${email}`)
        .send({ credential: email, password: PASSWORD });
}

export const decodeClaims = (jwt: string): Record<string, unknown> =>
    JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
export const decodeHeader = (jwt: string): Record<string, unknown> =>
    JSON.parse(Buffer.from(jwt.split('.')[0], 'base64url').toString());
