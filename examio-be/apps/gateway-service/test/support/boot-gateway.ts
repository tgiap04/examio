import type { AddressInfo } from 'net';
import { join } from 'path';
import { Metadata, credentials, loadPackageDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import type { MicroserviceOptions } from '@nestjs/microservices';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { FakeUpstream } from './fake-upstream';
import { isAddrInUse, reservePort } from './ports';
import { TokenIssuer } from './tokens';

export interface Harness {
    app: NestExpressApplication;
    baseUrl: string;
    grpcUrl: string;
    issuer: TokenIssuer;
    exam: FakeUpstream;
    studyroom: FakeUpstream;
    vocabulary: FakeUpstream;
    auth: FakeUpstream;
    finance: FakeUpstream;
    admin: FakeUpstream;
    close(): Promise<void>;
}

/**
 * Boots the real gateway module with the real edge wiring (`configureGatewayApp`)
 * against fake upstreams, a local JWKS, and the Redis + RabbitMQ named by the
 * environment (REDIS_HOST/PORT, RABBITMQ_URL).
 */
export async function bootGateway(extraEnv: Record<string, string> = {}): Promise<Harness> {
    const issuer = await new TokenIssuer().start();
    const [exam, auth, finance, admin, studyroom, vocabulary] = await Promise.all(
        [1, 2, 3, 4, 5, 6].map(() => new FakeUpstream().start())
    );
    // A caller that already told another service where the gateway listens (GRPC_PORT) gets one attempt.
    const pinnedPort = extraEnv.GRPC_PORT ? Number(extraEnv.GRPC_PORT) : undefined;
    let grpcPort = pinnedPort ?? (await reservePort());
    Object.assign(process.env, {
        NODE_ENV: 'test',
        AUTH_SERVICE_URL: auth.url,
        EXAM_SERVICE_URL: exam.url,
        STUDYROOM_SERVICE_URL: studyroom.url,
        VOCABULARY_SERVICE_URL: vocabulary.url,
        FINANCE_SERVICE_URL: finance.url,
        ADMIN_SERVICE_URL: admin.url,
        AUTH_JWKS_URL: issuer.jwksUrl,
        JWT_ISSUER: 'examio-auth',
        JWT_AUDIENCE: 'examio',
        FRONTEND_URL: 'https://allowed.example',
        GRPC_PORT: String(grpcPort),
        ...extraEnv,
    });

    // Proto and asset paths resolve against the repo root (examio-be/).
    process.chdir(join(__dirname, '..', '..', '..', '..'));
    const [{ GatewayModule }, { configureGatewayApp }, { grpcServerOptions }, { PROTO_FILES }] =
        await Promise.all([
            import('../../src/gateway.module'),
            import('../../src/app-setup'),
            import('@examio/grpc'),
            import('@examio/contracts'),
        ]);

    let app!: NestExpressApplication;
    let onUpgrade!: ReturnType<typeof configureGatewayApp>;
    for (let attempt = 1; ; attempt++) {
        process.env.GRPC_PORT = String(grpcPort);
        const moduleRef = await Test.createTestingModule({ imports: [GatewayModule] }).compile();
        app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
        onUpgrade = configureGatewayApp(app);
        app.connectMicroservice<MicroserviceOptions>(grpcServerOptions([PROTO_FILES.gatewayControl]), {
            inheritAppConfig: true,
        });
        try {
            await app.startAllMicroservices();
            break;
        } catch (err) {
            // Another listener took the port between reserving and binding: pick again.
            await Promise.race([app.close(), new Promise((r) => setTimeout(r, 5000))]);
            if (!isAddrInUse(err) || pinnedPort !== undefined || attempt >= 5) throw err;
            grpcPort = await reservePort();
        }
    }
    await app.listen(0, '127.0.0.1');
    app.getHttpServer().on('upgrade', onUpgrade);
    const port = (app.getHttpServer().address() as AddressInfo).port;
    // Page flags live in the shared Redis: an aborted earlier run must not leave a page disabled.
    const { ConfigService } = await import('../../src/services/config.service');
    await app.get(ConfigService).setPages({});

    return {
        app,
        baseUrl: `http://127.0.0.1:${port}`,
        grpcUrl: `127.0.0.1:${grpcPort}`,
        issuer,
        exam,
        studyroom,
        vocabulary,
        auth,
        finance,
        admin,
        async close() {
            // Closing right after boot can hang on the AMQP channel teardown; bound it.
            await Promise.race([app.close(), new Promise((r) => setTimeout(r, 5000))]);
            await Promise.all([exam, studyroom, vocabulary, auth, finance, admin].map((u) => u.stop()));
            await issuer.stop();
        },
    };
}

export type ControlMethod = 'RevokeSession' | 'InvalidateUser' | 'SetPageFlags';

/** One GatewayControl call; resolves `{ code: 0 }` on success or the gRPC status code. */
export function callControl(
    grpcUrl: string,
    method: ControlMethod,
    request: Record<string, unknown>,
    bearer?: string
): Promise<{ code: number; details?: string }> {
    const root = join(process.cwd(), 'proto');
    const definition = loadSync(join(root, 'examio/gateway/v1/gateway_control.proto'), {
        keepCase: false,
        longs: String,
        defaults: true,
        includeDirs: [root],
    });
    // The loaded package is untyped by nature; only the client constructor is read.
    const pkg = loadPackageDefinition(definition) as unknown as {
        examio: { gateway: { v1: { GatewayControl: new (...a: unknown[]) => Record<string, Function> } } };
    };
    const client = new pkg.examio.gateway.v1.GatewayControl(grpcUrl, credentials.createInsecure());
    const metadata = new Metadata();
    if (bearer) metadata.set('authorization', `Bearer ${bearer}`);
    return new Promise((resolve) => {
        client[method](request, metadata, (err: { code: number; details: string } | null) => {
            (client as unknown as { close(): void }).close();
            resolve(err ? { code: err.code, details: err.details } : { code: 0 });
        });
    });
}
