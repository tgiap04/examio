import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import type { PrismaService as AdminPrisma } from '../../../apps/admin-service/src/prisma';
import {
    AuthApp,
    bootAuthApp,
    loginVerified,
    registerUser,
} from '../../../apps/auth-service/test/helpers/auth-app';

/**
 * Real auth-service (HTTP + gRPC) and real admin-service, each on its OWN schema/role
 * (AUTH_DATABASE_URL / ADMIN_DATABASE_URL):
 * admin calls auth over gRPC with the caller's own access token. Nothing in
 * the guard / client path is mocked. Mirrors admin `main.ts` (error envelope).
 */
export interface Harness {
    auth: AuthApp;
    admin: INestApplication;
    /** admin-service's own database (audit rows): auth's `prisma` cannot see it. */
    adminDb: AdminPrisma;
    http(): ReturnType<typeof request>;
    close(): Promise<void>;
}

const created: string[] = [];

/** Providers replaced by fakes (the services admin talks to that this harness does not boot). */
export interface HarnessOverrides {
    providers?: Array<[token: unknown, value: unknown]>;
}

export async function bootHarness(overrides: HarnessOverrides = {}): Promise<Harness> {
    // Each service builds its Prisma client from DATABASE_URL while it is composed.
    process.env.DATABASE_URL = serviceDatabaseUrl('AUTH');
    const auth = await bootAuthApp({ grpc: true });
    // Start from a known state: no admin left over from an earlier suite or run
    // (last-admin outcomes must not depend on leftovers).
    await auth.prisma.user.updateMany({ where: { isSystemAdmin: true }, data: { isSystemAdmin: false } });
    process.env.AUTH_JWKS_URL = `${auth.url}/.well-known/jwks.json`;
    process.env.AUTH_GRPC_URL = auth.grpcUrl as string;
    process.env.DATABASE_URL = serviceDatabaseUrl('ADMIN');
    const { AdminServiceModule } = await import('../../../apps/admin-service/src/admin-service.module');
    const { HttpErrorEnvelopeFilter } = await import('@examio/http');
    let builder = Test.createTestingModule({ imports: [AdminServiceModule] });
    for (const [token, value] of overrides.providers ?? []) {
        builder = builder.overrideProvider(token as never).useValue(value);
    }
    const moduleRef = await builder.compile();
    const admin = moduleRef.createNestApplication();
    admin.useGlobalFilters(new HttpErrorEnvelopeFilter());
    await admin.init();
    const { PrismaService } = await import('../../../apps/admin-service/src/prisma');
    return {
        auth,
        admin,
        adminDb: admin.get(PrismaService),
        http: () => request(admin.getHttpServer()),
        close: async () => {
            await deactivateCreated(auth);
            await Promise.race([admin.close(), new Promise((r) => setTimeout(r, 5000))]);
            await auth.close();
        },
    };
}

/** Teardown: users this suite created stop being admins/sessions/accounts. */
async function deactivateCreated(auth: AuthApp): Promise<void> {
    if (created.length === 0) return;
    const ids = created.splice(0);
    await auth.prisma.userSession.updateMany({ where: { userId: { in: ids } }, data: { isActive: false } });
    await auth.prisma.user.updateMany({
        where: { id: { in: ids } },
        data: { isSystemAdmin: false, deletedAt: new Date() },
    });
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export interface TestUser {
    id: string;
    email: string;
    username: string;
    token: string;
    refreshToken: string;
}

/** Registers, optionally patches the row, verifies the email, logs in. */
export async function makeUser(auth: AuthApp, data: Record<string, unknown> = {}): Promise<TestUser> {
    const u = await registerUser(auth);
    if (Object.keys(data).length) await auth.prisma.user.update({ where: { id: u.id }, data });
    created.push(u.id);
    const login = await loginVerified(auth, u.email);
    return { id: u.id, email: u.email, username: u.username, token: login.body.token, refreshToken: login.body.refreshToken };
}

/** Leave exactly these users as the active admins (the DB is shared across suites). */
export async function onlyAdmins(auth: AuthApp, ...ids: string[]): Promise<void> {
    await auth.prisma.user.updateMany({ where: { isSystemAdmin: true, id: { notIn: ids } }, data: { isSystemAdmin: false } });
    await auth.prisma.user.updateMany({ where: { id: { in: ids } }, data: { isSystemAdmin: true, isBanned: false } });
}

export const authzEvents = (auth: AuthApp, userId: string) =>
    auth.prisma.outboxEvent.findMany({
        where: { type: 'auth.user.authz_changed', envelope: { path: ['data', 'userId'], equals: userId } },
        orderBy: { seq: 'asc' },
    });

/** `<SVC>_DATABASE_URL`: the service-role URL of one service's schema (local throwaway DB only). */
export function serviceDatabaseUrl(service: 'AUTH' | 'FINANCE' | 'ADMIN' | 'CONTENT' | 'ASSESSMENT'): string {
    const url = process.env[`${service}_DATABASE_URL`];
    if (!url) throw new Error(`${service}_DATABASE_URL is required for the cross-app e2e`);
    return url;
}
