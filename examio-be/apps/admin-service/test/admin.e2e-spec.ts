import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Reflector } from '@nestjs/core';
import { AdminServiceModule } from '../src/admin-service.module';
import { AdminGuard } from '@examio/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@examio/database';

/** Fake admin user injected by the mock guard */
const FAKE_ADMIN_USER = {
    id: 'admin-fake-id',
    username: 'admin',
    email: 'admin@examio.test',
    isAdmin: true,
    isVerified: true,
    isBanned: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
};

/** Fake non-admin user injected by the mock guard */
const FAKE_REGULAR_USER = {
    id: 'user-fake-id',
    username: 'user',
    email: 'user@examio.test',
    isAdmin: false,
    isVerified: true,
    isBanned: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
};

/**
 * Builds a NestJS testing module for the admin-service, overriding the
 * AdminGuard with a mock that injects the supplied user directly into req.user.
 */
async function buildTestingModule(fakeUser: object) {
    return Test.createTestingModule({
        imports: [AdminServiceModule],
    })
        .overrideGuard(AdminGuard)
        .useValue({
            canActivate: (_context) => {
                const req = _context.switchToHttp().getRequest();
                req.user = fakeUser;
                return true;
            },
        })
        .overrideProvider(JwtService)
        .useValue({ verifyAsync: jest.fn().mockResolvedValue({ userId: fakeUser['id'] }) })
        .overrideProvider(PrismaService)
        .useValue({
            user: {
                findUnique: jest.fn().mockResolvedValue(fakeUser),
                findMany: jest.fn().mockResolvedValue([{ id: 'user-1', email: 'u@e.com' }]),
                count: jest.fn().mockResolvedValue(1),
                update: jest.fn().mockResolvedValue({ ...fakeUser, isAdmin: true }),
            },
            wallet: {
                findUnique: jest.fn().mockResolvedValue({ id: 'w1', balance: 100 }),
            },
            adminAudit: {
                create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
                findMany: jest.fn().mockResolvedValue([{ id: 'audit-1' }]),
                count: jest.fn().mockResolvedValue(1),
            },
        })
        .compile();
}

describe('AdminService (e2e)', () => {
    let app: INestApplication;

    describe('Admin user — all endpoints accessible', () => {
        beforeEach(async () => {
            const moduleFixture: TestingModule = await buildTestingModule(FAKE_ADMIN_USER);
            app = moduleFixture.createNestApplication();
            await app.init();
        });

        afterEach(async () => {
            await app?.close();
        });

        it('GET /admin/users — returns paginated users list', async () => {
            return request(app.getHttpServer())
                .get('/admin/users?page=1&pageSize=20')
                .expect(200)
                .expect((res) => {
                    expect(res.body).toHaveProperty('rows');
                    expect(Array.isArray(res.body.rows)).toBe(true);
                });
        });

        it('POST /admin/users/:id/grant-admin — grants admin and creates audit row', async () => {
            const { PrismaService } = await import('@examio/database');
            const moduleRef = app.get(PrismaService);

            return request(app.getHttpServer())
                .post(`/admin/users/${FAKE_ADMIN_USER.id}/grant-admin`)
                .expect(200)
                .expect((res) => {
                    expect(res.body).toHaveProperty('user');
                    expect(moduleRef.adminAudit.create).toHaveBeenCalled();
                });
        });

        it('GET /admin/audit — returns audit rows filtered by action', async () => {
            return request(app.getHttpServer())
                .get('/admin/audit?action=admin.user.grant')
                .expect(200)
                .expect((res) => {
                    expect(res.body).toHaveProperty('rows');
                    expect(Array.isArray(res.body.rows)).toBe(true);
                });
        });

        it('GET /admin/stats/overview — returns KPI overview', async () => {
            return request(app.getHttpServer())
                .get('/admin/stats/overview')
                .expect(200)
                .expect((res) => {
                    expect(res.body).toHaveProperty('totalUsers');
                });
        });
    });

    describe('Non-admin user — forbidden on all admin routes', () => {
        beforeEach(async () => {
            const moduleFixture: TestingModule = await buildTestingModule(FAKE_REGULAR_USER);
            app = moduleFixture.createNestApplication();
            await app.init();
        });

        afterEach(async () => {
            await app?.close();
        });

        it('GET /admin/users — returns 403 Forbidden', async () => {
            return request(app.getHttpServer())
                .get('/admin/users')
                .expect(403);
        });
    });
});