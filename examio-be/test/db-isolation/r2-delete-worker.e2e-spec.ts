import { join } from 'path';
import { Pool } from 'pg';
import { Test } from '@nestjs/testing';
import { PROTO_FILES } from '@examio/contracts';
import { startTestGrpcServer, TestGrpcServer } from '@examio/grpc/testing';
import { AuthJwtModule, ServiceTokenClient, createTokenVerifier } from '@examio/auth-jwt';
import {
    TEST_AUDIENCE,
    TEST_ISSUER,
    createTestKeyPair,
    serviceClaims,
    signTestToken,
    type TestKeyPair,
} from '@examio/auth-jwt/testing';
import { R2ServiceController } from '../../apps/r2-service/src/r2-service.controller';
import { R2ServiceService } from '../../apps/r2-service/src/r2-service.service';
import { toPgConnectionString } from '../../libs/messaging/src/relay-pool';
import { assertLocal, describeWhenEnabled, urlOf } from './db-env';

/**
 * The real WorkerModule of auth, exam, vocabulary and document (DI, pg pool, R2 gRPC client) drains a
 * queued key through the REAL r2 controller behind its `@ServiceOnly('exam','auth','vocabulary','document')`
 * guard. Needs the four service DB URLs, RABBITMQ_URL (auth worker also runs the outbox
 * relay), RABBITMQ_DOCUMENT_PASS (the document worker consumes `document.events` as its own broker
 * user) and the auth signing key env (JWT_PRIVATE_KEY/JWT_KID/SERVICE_CLIENTS).
 */
const enabled = Boolean(
    urlOf('auth') &&
        urlOf('exam') &&
        urlOf('vocabulary') &&
        urlOf('document') &&
        process.env.RABBITMQ_URL &&
        process.env.RABBITMQ_DOCUMENT_PASS &&
        process.env.JWT_PRIVATE_KEY
);
const describeWorker = describeWhenEnabled(
    enabled,
    'AUTH/EXAM/VOCABULARY/DOCUMENT_DATABASE_URL, RABBITMQ_URL, RABBITMQ_DOCUMENT_PASS and JWT_PRIVATE_KEY'
);

/** The broker URL the job was given (auth's user); read once because each worker run overrides RABBITMQ_URL. */
const SHARED_BROKER_URL = process.env.RABBITMQ_URL as string;

/** Every worker uses the shared broker URL, except document: it consumes as its own broker user. */
function brokerUrlFor(svc: string): string {
    if (svc !== 'document') return SHARED_BROKER_URL;
    const url = new URL(SHARED_BROKER_URL);
    url.username = 'document';
    url.password = process.env.RABBITMQ_DOCUMENT_PASS as string;
    return url.toString();
}

describeWorker('R2 delete worker modules -> r2 DeleteObjects (e2e)', () => {
    const tag = `w${Date.now().toString(36)}`;
    const deleted: string[] = [];
    let keys: TestKeyPair;
    let r2: TestGrpcServer;
    const originalCwd = process.cwd();

    beforeAll(async () => {
        assertLocal(urlOf('auth') as string);
        assertLocal(urlOf('exam') as string);
        assertLocal(urlOf('vocabulary') as string);
        assertLocal(urlOf('document') as string);
        process.chdir(join(__dirname, '..', '..'));
        keys = await createTestKeyPair('r2w-k');
        const moduleRef = await Test.createTestingModule({
            imports: [
                AuthJwtModule.forRoot({
                    serviceName: 'r2',
                    verifier: {
                        useFactory: () =>
                            createTokenVerifier({
                                issuer: TEST_ISSUER,
                                audiences: [TEST_AUDIENCE, 'r2'],
                                localJwks: { keys: [keys.publicJwk] },
                            }),
                    },
                }),
            ],
            controllers: [R2ServiceController],
            providers: [
                {
                    provide: R2ServiceService,
                    useValue: {
                        deleteObjects: async (batch: string[]) => {
                            deleted.push(...batch);
                            return { deletedCount: batch.length, failedKeys: [] };
                        },
                    },
                },
            ],
        }).compile();
        r2 = await startTestGrpcServer(moduleRef, [PROTO_FILES.r2]);
        process.env.R2_GRPC_URL = r2.url;
        process.env.R2_DELETE_POLL_MS = '50';
    });
    afterAll(async () => {
        await r2?.close();
        process.chdir(originalCwd);
    });

    const waitUntil = async (cond: () => Promise<boolean>) => {
        for (let i = 0; i < 100; i++) {
            if (await cond()) return;
            await new Promise((r) => setTimeout(r, 100));
        }
        throw new Error('timed out waiting for the worker');
    };

    it.each(['auth', 'exam', 'vocabulary', 'document'] as const)('%s WorkerModule sends the queued key as a service token and removes the row', async (svc) => {
        const dbUrl = urlOf(svc) as string;
        process.env.DATABASE_URL = dbUrl;
        process.env.RABBITMQ_URL = brokerUrlFor(svc);
        const key = `${tag}/${svc}.png`;
        const pool = new Pool({ connectionString: toPgConnectionString(dbUrl), max: 2 });
        await pool.query('INSERT INTO r2_delete_tasks (id, key) VALUES (gen_random_uuid(), $1)', [key]);

        const { WorkerModule } = await import(`../../apps/${svc}-service/src/worker.module`);
        const token = await signTestToken(keys, { claims: serviceClaims(svc), audience: 'r2' });
        const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] })
            .overrideProvider(ServiceTokenClient)
            .useValue({ getToken: async () => token })
            .compile();
        await moduleRef.init();
        try {
            await waitUntil(async () => (await pool.query('SELECT 1 FROM r2_delete_tasks WHERE key = $1', [key])).rowCount === 0);
            expect(deleted.filter((k) => k === key)).toEqual([key]);
        } finally {
            await moduleRef.close();
            await pool.query('DELETE FROM r2_delete_tasks WHERE key = $1', [key]);
            await pool.end();
        }
    });
});
