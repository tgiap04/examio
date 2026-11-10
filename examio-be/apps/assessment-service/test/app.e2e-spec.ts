import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { HEALTH_ROUTES_EXCLUDED_FROM_PREFIX } from '@examio/observability';

/**
 * Boots the real assessment-service.module. Needs the local/CI infra from
 * .github/workflows/ci.yml (Postgres with migrations applied, Redis,
 * RabbitMQ) and the matching env vars (DATABASE_URL, REDIS_HOST,
 * REDIS_PORT, JWT_PRIVATE_KEY, ...).
 */
describe('assessment-service health (e2e)', () => {
    const originalCwd = process.cwd();
    let app: INestApplication;

    beforeAll(async () => {
        // Proto/template paths resolve against the repo root (examio-be/),
        // whichever directory jest was launched from.
        process.chdir(join(__dirname, '..', '..', '..'));
        // Imported lazily so the chdir above applies to module decorators.
        const { AssessmentServiceModule } = await import('../src/assessment-service.module');
        const moduleRef = await Test.createTestingModule({
            imports: [AssessmentServiceModule],
        }).compile();
        app = moduleRef.createNestApplication();
        app.setGlobalPrefix('api/v1', {
            exclude: HEALTH_ROUTES_EXCLUDED_FROM_PREFIX,
        });
        await app.init();
    });

    afterAll(async () => {
        // Known issue: closing right after boot can hang on the RabbitMQ
        // channel teardown (libs/common events). Bound it so the suite
        // reports its real result; jest-e2e.json sets forceExit.
        await Promise.race([
            app?.close(),
            new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
        process.chdir(originalCwd);
    });

    it('GET /health/live returns 200', async () => {
        const res = await request(app.getHttpServer()).get('/health/live');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('GET /health/ready returns 200 when dependencies are up', async () => {
        const res = await request(app.getHttpServer()).get('/health/ready');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('echoes an inbound X-Request-Id', async () => {
        const res = await request(app.getHttpServer())
            .get('/health/live')
            .set('X-Request-Id', 'req_e2e-check');

        expect(res.headers['x-request-id']).toBe('req_e2e-check');
    });
});
