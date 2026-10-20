import { randomUUID } from 'crypto';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as amqp from 'amqplib';
import * as request from 'supertest';
import { createEnvelope } from '@examio/messaging';
import { HEALTH_ROUTES_EXCLUDED_FROM_PREFIX } from '@examio/observability';
import { createTestKeyPair, signTestToken, type TestKeyPair } from '@examio/auth-jwt/testing';

/**
 * Money e2e: real Postgres + RabbitMQ (rendered definitions). RABBITMQ_URL
 * connects as `finance` (service under test), RABBITMQ_AUTH_URL as `auth`.
 */
const FINANCE_URL = process.env.RABBITMQ_URL as string;
const AUTH_URL = process.env.RABBITMQ_AUTH_URL as string;
const KEY = 'auth.user.authz_changed';

const prisma = new PrismaClient();
let worker: INestApplicationContext | null = null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => Promise<T | null | false>, ms: number): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
        const v = await fn();
        if (v) return v;
        if (Date.now() > end) throw new Error('waitFor timed out');
        await sleep(250);
    }
}

async function startWorker() {
    const { WorkerModule } = await import('../src/worker.module');
    worker = await NestFactory.createApplicationContext(WorkerModule, {
        logger: process.env.E2E_LOG ? ['log', 'error', 'warn'] : ['error', 'warn'],
    });
    worker.enableShutdownHooks();
}
async function stopWorker() {
    await worker?.close();
    worker = null;
}

async function publishAs(url: string, envelope: object) {
    const conn = await amqp.connect(url);
    const ch = await conn.createConfirmChannel();
    ch.publish('examio.events', KEY, Buffer.from(JSON.stringify(envelope)), {
        persistent: true,
        contentType: 'application/json',
        messageId: (envelope as { id: string }).id,
    });
    await ch.waitForConfirms();
    await conn.close();
}

async function queueExists(name: string): Promise<boolean> {
    const conn = await amqp.connect(FINANCE_URL);
    conn.on('error', () => undefined);
    try {
        const ch = await conn.createChannel();
        ch.on('error', () => undefined);
        await ch.checkQueue(name);
        return true;
    } catch {
        return false;
    } finally {
        await conn.close().catch(() => undefined);
    }
}

async function purgeFinanceQueues() {
    const queues = ['finance.events', 'finance.retry.30s', 'finance.dlq'];
    for (const q of queues) await waitFor(() => queueExists(q), 15_000);
    const conn = await amqp.connect(FINANCE_URL);
    const ch = await conn.createChannel();
    for (const q of queues) await ch.purgeQueue(q);
    await conn.close();
}

const uidList: string[] = [];
const uid = () => {
    const id = `e2e_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    uidList.push(id);
    return id;
};
const newUser = (id: string, role: 'STUDENT' | 'TEACHER' = 'TEACHER') =>
    prisma.user.create({ data: { id, email: `${id}@e2e.test`, username: id, password: null, role } });
const authzEvent = (userId: string, role: 'STUDENT' | 'TEACHER', reason: string, av = 1) =>
    createEnvelope(
        KEY,
        { userId, authzVersion: av, role, isSystemAdmin: false, isBanned: false, reason, version: av },
        { source: 'auth' }
    );
const walletOf = (userId: string) => prisma.wallet.findUnique({ where: { userId } });
const welcomeTxs = (walletId: string) =>
    prisma.walletTransaction.count({ where: { walletId, description: 'Welcome bonus credits' } });

describe('finance teacher provisioning on auth.user.authz_changed (e2e)', () => {
    beforeAll(async () => {
        await startWorker();
        await purgeFinanceQueues();
    });
    afterAll(async () => {
        await stopWorker();
        await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: { in: uidList } } } });
        await prisma.wallet.deleteMany({ where: { userId: { in: uidList } } });
        await prisma.userSubscription.deleteMany({ where: { userId: { in: uidList } } });
        await prisma.user.deleteMany({ where: { id: { in: uidList } } });
        await prisma.$disconnect();
    });

    it('promote to TEACHER -> wallet with 20 credits, one welcome tx and a Free subscription', async () => {
        const userId = uid();
        await newUser(userId);
        await publishAs(AUTH_URL, authzEvent(userId, 'TEACHER', 'role'));
        const wallet = await waitFor(() => walletOf(userId), 15_000);
        expect(wallet.balance).toBe(20);
        expect(await welcomeTxs(wallet.id)).toBe(1);
        const sub = await waitFor(() => prisma.userSubscription.findUnique({ where: { userId } }), 5_000);
        expect(sub).toMatchObject({ tier: 0, isActive: false });
    });

    it('a STUDENT event provisions nothing', async () => {
        const userId = uid();
        await newUser(userId, 'STUDENT');
        const marker = uid();
        await newUser(marker);
        await publishAs(AUTH_URL, authzEvent(userId, 'STUDENT', 'role'));
        await publishAs(AUTH_URL, authzEvent(marker, 'TEACHER', 'role'));
        await waitFor(() => walletOf(marker), 15_000); // events are ordered per queue
        expect(await walletOf(userId)).toBeNull();
        expect(await prisma.userSubscription.findUnique({ where: { userId } })).toBeNull();
    });

    it('demote + re-promote keeps the wallet at 20 (no second welcome bonus)', async () => {
        const userId = uid();
        await newUser(userId);
        await publishAs(AUTH_URL, authzEvent(userId, 'TEACHER', 'role', 1));
        const wallet = await waitFor(() => walletOf(userId), 15_000);
        await publishAs(AUTH_URL, authzEvent(userId, 'STUDENT', 'role', 2));
        await publishAs(AUTH_URL, authzEvent(userId, 'TEACHER', 'role', 3));
        const marker = uid();
        await newUser(marker);
        await publishAs(AUTH_URL, authzEvent(marker, 'TEACHER', 'role'));
        await waitFor(() => walletOf(marker), 15_000);

        expect((await walletOf(userId))?.balance).toBe(20);
        expect(await welcomeTxs(wallet.id)).toBe(1);
    });

    it('a twice-delivered event is a no-op the second time', async () => {
        const userId = uid();
        await newUser(userId);
        const env = authzEvent(userId, 'TEACHER', 'role');
        await publishAs(AUTH_URL, env);
        await publishAs(AUTH_URL, env);
        const wallet = await waitFor(() => walletOf(userId), 15_000);
        await sleep(1500);
        expect(await prisma.wallet.count({ where: { userId } })).toBe(1);
        expect(await welcomeTxs(wallet.id)).toBe(1);
        expect(await prisma.processedEvent.count({ where: { consumer: 'finance', eventId: env.id } })).toBe(1);
    });

    it('a forced re-apply recreates a wallet that was deleted in the fixture', async () => {
        const userId = uid();
        await newUser(userId);
        await publishAs(AUTH_URL, authzEvent(userId, 'TEACHER', 'role', 1));
        const first = await waitFor(() => walletOf(userId), 15_000);
        await prisma.walletTransaction.deleteMany({ where: { walletId: first.id } });
        await prisma.wallet.delete({ where: { userId } });

        await publishAs(AUTH_URL, authzEvent(userId, 'TEACHER', 'reapply', 1));
        const again = await waitFor(() => walletOf(userId), 15_000);
        expect(again.id).not.toBe(first.id);
        expect(again.balance).toBe(20);
    });

    it('dead-letters an envelope whose source disagrees with the routing key', async () => {
        const conn = await amqp.connect(FINANCE_URL);
        const ch = await conn.createChannel();
        const before = (await ch.checkQueue('finance.dlq')).messageCount;
        const forged = { ...authzEvent(uid(), 'TEACHER', 'role'), source: 'exam' };
        await publishAs(AUTH_URL, forged);
        await waitFor(async () => (await ch.checkQueue('finance.dlq')).messageCount > before, 10_000);
        await conn.close();
    });
});

describe('ensureWallet paths (e2e)', () => {
    let app: INestApplication;
    let jwks: Server;
    let keys: TestKeyPair;

    beforeAll(async () => {
        keys = await createTestKeyPair('fin-k');
        jwks = createServer((_req, res) => {
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ keys: [keys.publicJwk] }));
        });
        await new Promise<void>((r) => jwks.listen(0, '127.0.0.1', r));
        process.env.AUTH_JWKS_URL = `http://127.0.0.1:${(jwks.address() as AddressInfo).port}/jwks`;
        const { FinanceServiceModule } = await import('../src/finance-service.module');
        const moduleRef = await Test.createTestingModule({ imports: [FinanceServiceModule] }).compile();
        app = moduleRef.createNestApplication();
        app.setGlobalPrefix('api/v1', { exclude: HEALTH_ROUTES_EXCLUDED_FROM_PREFIX });
        await app.init();
    });
    afterAll(async () => {
        await Promise.race([app.close(), sleep(5000)]);
        await new Promise((r) => jwks.close(r));
        await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: { in: uidList } } } });
        await prisma.wallet.deleteMany({ where: { userId: { in: uidList } } });
        await prisma.userSubscription.deleteMany({ where: { userId: { in: uidList } } });
        await prisma.user.deleteMany({ where: { id: { in: uidList } } });
    });

    const tokenFor = (userId: string, roles: string[]) =>
        signTestToken(keys, { claims: { sub: userId, roles, email_verified: true }, audience: 'examio' });

    it('GET /wallet/info by a TEACHER without a wallet -> 200 with balance 20 (lazy ensure)', async () => {
        const userId = uid();
        await newUser(userId);
        const res = await request(app.getHttpServer())
            .get('/api/v1/wallet/info')
            .set('authorization', `Bearer ${await tokenFor(userId, ['TEACHER'])}`);
        expect(res.status).toBe(200);
        expect(res.body.balance).toBe(20);
        expect(await prisma.userSubscription.count({ where: { userId } })).toBe(1);
    });

    it('GET /wallet/details by a TEACHER without a wallet provisions it too', async () => {
        const userId = uid();
        await newUser(userId);
        const res = await request(app.getHttpServer())
            .get('/api/v1/wallet/details')
            .set('authorization', `Bearer ${await tokenFor(userId, ['TEACHER'])}`);
        expect(res.status).toBe(200);
        expect((await walletOf(userId))?.balance).toBe(20);
    });

    it('a STUDENT is refused (403, no wallet:use) and no wallet is created', async () => {
        const userId = uid();
        await newUser(userId, 'STUDENT');
        const res = await request(app.getHttpServer())
            .get('/api/v1/wallet/info')
            .set('authorization', `Bearer ${await tokenFor(userId, ['STUDENT'])}`);
        expect(res.status).toBe(403);
        expect(await walletOf(userId)).toBeNull();
    });

    it('two ensureWallet calls racing for one user -> 1 wallet, 1 welcome tx', async () => {
        const { EnsureWalletService } = await import('../src/modules/wallet/ensure-wallet.service');
        const ensure = app.get(EnsureWalletService, { strict: false });
        for (let round = 0; round < 5; round++) {
            const userId = uid();
            await newUser(userId);
            const results = await Promise.all(Array.from({ length: 4 }, () => ensure.ensure(userId)));
            expect(results.filter((r) => r.created)).toHaveLength(1);
            const wallet = (await walletOf(userId))!;
            expect(await prisma.wallet.count({ where: { userId } })).toBe(1);
            expect(await welcomeTxs(wallet.id)).toBe(1);
            expect(await prisma.userSubscription.count({ where: { userId } })).toBe(1);
        }
    });

    it('reconcile-teachers on a fixture with 2 missing wallets creates exactly 2', async () => {
        const { EnsureWalletService } = await import('../src/modules/wallet/ensure-wallet.service');
        const { ReconcileTeachers } = await import('../src/commands/reconcile-teachers');
        const have = uid();
        const missingA = uid();
        const missingB = uid();
        for (const id of [have, missingA, missingB]) await newUser(id);
        await prisma.wallet.create({ data: { id: `w_${have}`, userId: have, balance: 7 } });

        const auth = {
            listUsers: jest.fn(async ({ page }: { page: number }) => ({
                users: page === 1 ? [{ id: have }, { id: missingA }, { id: missingB }] : [],
                page: { total: 3, page, limit: 100 },
            })),
        };
        const reconcile = new ReconcileTeachers(auth as never, app.get(EnsureWalletService, { strict: false }));
        await expect(reconcile.run()).resolves.toEqual({ teachers: 3, created: 2 });
        expect((await walletOf(have))?.balance).toBe(7);
        expect((await walletOf(missingA))?.balance).toBe(20);
        expect((await walletOf(missingB))?.balance).toBe(20);
        await expect(reconcile.run()).resolves.toEqual({ teachers: 3, created: 0 });
    });
});
