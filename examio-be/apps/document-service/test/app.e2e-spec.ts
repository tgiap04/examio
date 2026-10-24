import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { HEALTH_ROUTES_EXCLUDED_FROM_PREFIX } from '@examio/observability';

/**
 * Boots the real document-service module (API role). Needs Postgres with the migration applied and
 * the env of .github/workflows/ci.yml (DATABASE_URL, AUTH_TOKEN_URL, SERVICE_CLIENT_SECRET, ...).
 * No broker connection: the API role only writes the outbox.
 */
describe('document-service health (e2e)', () => {
    const originalCwd = process.cwd();
    let app: INestApplication;

    beforeAll(async () => {
        // Proto paths resolve against the repo root (examio-be/), whichever directory jest ran from.
        process.chdir(join(__dirname, '..', '..', '..'));
        // Imported lazily so the chdir above applies to module decorators.
        const { DocumentServiceModule } = await import('../src/document-service.module');
        const moduleRef = await Test.createTestingModule({ imports: [DocumentServiceModule] }).compile();
        app = moduleRef.createNestApplication();
        app.setGlobalPrefix('api/v1', { exclude: HEALTH_ROUTES_EXCLUDED_FROM_PREFIX });
        await app.init();
    });

    afterAll(async () => {
        await Promise.race([app?.close(), new Promise((resolve) => setTimeout(resolve, 5000))]);
        process.chdir(originalCwd);
    });

    it('GET /health/live returns 200', async () => {
        const res = await request(app.getHttpServer()).get('/health/live');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('GET /health/ready returns 200 when the database is up', async () => {
        const res = await request(app.getHttpServer()).get('/health/ready');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('an anonymous upload is 401 (deny by default)', async () => {
        const res = await request(app.getHttpServer()).get('/api/v1/ai/upload/x');
        expect(res.status).toBe(401);
    });
});
