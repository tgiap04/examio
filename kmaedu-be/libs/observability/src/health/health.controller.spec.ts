import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import * as request from 'supertest';
import { HealthController } from './health.controller';
import {
    READINESS_CHECKS,
    READINESS_TIMEOUT_MS,
    ReadinessCheck,
} from './readiness-check';

async function buildApp(
    checks: ReadinessCheck[],
    timeoutMs?: number
): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
        imports: [TerminusModule.forRoot({ logger: false })],
        controllers: [HealthController],
        providers: [
            { provide: READINESS_CHECKS, useValue: checks },
            ...(timeoutMs === undefined
                ? []
                : [{ provide: READINESS_TIMEOUT_MS, useValue: timeoutMs }]),
        ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
}

const passing = (name: string): ReadinessCheck => ({
    name,
    check: jest.fn().mockResolvedValue(undefined),
});

describe('HealthController', () => {
    let app: INestApplication;

    afterEach(async () => {
        await app?.close();
    });

    it('GET /health/live is 200 without running any readiness check', async () => {
        const check = passing('database');
        app = await buildApp([check]);

        const res = await request(app.getHttpServer()).get('/health/live');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(check.check).not.toHaveBeenCalled();
    });

    it('GET /health/ready is 200 when every check passes', async () => {
        const db = passing('database');
        const redis = passing('redis');
        app = await buildApp([db, redis]);

        const res = await request(app.getHttpServer()).get('/health/ready');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(Object.keys(res.body.info)).toEqual(['database', 'redis']);
        expect(db.check).toHaveBeenCalledTimes(1);
        expect(redis.check).toHaveBeenCalledTimes(1);
    });

    it('GET /health/ready is 200 with no checks registered (e.g. r2-service)', async () => {
        app = await buildApp([]);

        const res = await request(app.getHttpServer()).get('/health/ready');

        expect(res.status).toBe(200);
    });

    it('GET /health/ready is 503 naming the failing check, without error text', async () => {
        const failing: ReadinessCheck = {
            name: 'redis',
            check: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        };
        app = await buildApp([passing('database'), failing]);

        const res = await request(app.getHttpServer()).get('/health/ready');

        expect(res.status).toBe(503);
        expect(res.body).toEqual({
            status: 'error',
            checks: { database: 'up', redis: 'down' },
        });
        expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
    });

    it('does not leak raw driver error text in the 503 body but logs it server-side', async () => {
        const driverError =
            'Invalid `prisma.$queryRaw()` invocation: password authentication failed for user "kmaedu"';
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        app = await buildApp([
            {
                name: 'database',
                check: jest.fn().mockRejectedValue(new Error(driverError)),
            },
        ]);

        const res = await request(app.getHttpServer()).get('/health/ready');

        expect(res.status).toBe(503);
        expect(res.body).toEqual({
            status: 'error',
            checks: { database: 'down' },
        });
        expect(res.text).not.toContain('prisma');
        expect(res.text).not.toContain('password');
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining(driverError)
        );
        warn.mockRestore();
    });

    it('treats a check that never settles as failed once the timeout elapses', async () => {
        const hanging: ReadinessCheck = {
            name: 'slow-dependency',
            check: () => new Promise<void>(() => undefined),
        };
        app = await buildApp([hanging], 50);

        const res = await request(app.getHttpServer()).get('/health/ready');

        expect(res.status).toBe(503);
        expect(res.body).toEqual({
            status: 'error',
            checks: { 'slow-dependency': 'down' },
        });
    });
});
