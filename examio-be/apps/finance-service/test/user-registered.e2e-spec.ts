import { randomUUID } from 'crypto';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import * as amqp from 'amqplib';
import { createEnvelope } from '@examio/messaging';

/**
 * Real Postgres + RabbitMQ loaded with the rendered definitions
 * (deploy/rabbitmq/render-definitions.cjs). RABBITMQ_URL connects as `finance`
 * (the service under test); RABBITMQ_AUTH_URL as `auth` (the legitimate publisher).
 */
const FINANCE_URL = process.env.RABBITMQ_URL as string;
const AUTH_URL = process.env.RABBITMQ_AUTH_URL as string;
const KEY = 'auth.user.registered';

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
    worker = await NestFactory.createApplicationContext(WorkerModule, { logger: process.env.E2E_LOG ? ['log','error','warn','debug'] : ['error', 'warn'] });
    worker.enableShutdownHooks();
}

async function stopWorker() {
    await worker?.close();
    worker = null;
}

async function publishAs(url: string, envelope: object, key = KEY): Promise<void> {
    const conn = await amqp.connect(url);
    const ch = await conn.createConfirmChannel();
    ch.publish('examio.events', key, Buffer.from(JSON.stringify(envelope)), {
        persistent: true,
        contentType: 'application/json',
        messageId: (envelope as { id: string }).id,
    });
    await ch.waitForConfirms();
    await ch.close();
    await conn.close();
}

/** True once the queue exists. A missing queue closes its channel, so each probe uses a fresh one. */
async function queueExists(name: string): Promise<boolean> {
    const conn = await amqp.connect(FINANCE_URL);
    // A probe of a missing queue makes the broker close the channel with 404. amqplib
    // also emits 'error' for that, and an unlistened 'error' fails the suite as unhandled.
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

/**
 * The worker declares topology asynchronously (AmqpConnection never blocks boot),
 * so the queues may not exist yet when startWorker() resolves. Wait for them first.
 */
async function purgeFinanceQueues() {
    const queues = ['finance.events', 'finance.retry.30s', 'finance.dlq'];
    for (const q of queues) {
        await waitFor(async () => queueExists(q), 15_000);
    }
    const conn = await amqp.connect(FINANCE_URL);
    const ch = await conn.createChannel();
    for (const q of queues) {
        await ch.purgeQueue(q);
    }
    await conn.close();
}

const newUser = (id: string) =>
    prisma.user.create({ data: { id, email: `${id}@e2e.test`, username: id, password: null } });

const wallets = (userId: string) => prisma.wallet.count({ where: { userId } });

describe('finance auth.user.registered consumer (e2e)', () => {
    const userIds: string[] = [];
    const uid = () => {
        const id = `e2e_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
        userIds.push(id);
        return id;
    };

    beforeAll(async () => {
        await startWorker(); // declares the topology
        await purgeFinanceQueues();
    });

    afterAll(async () => {
        await stopWorker();
        await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: { in: userIds } } } });
        await prisma.wallet.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        await prisma.$disconnect();
    });

    it('applies a twice-delivered event exactly once (1 wallet, 1 welcome tx)', async () => {
        const userId = uid();
        await newUser(userId);
        const env = createEnvelope(KEY, { userId, email: `${userId}@e2e.test`, username: userId, utmSource: null }, { source: 'auth' });

        await publishAs(AUTH_URL, env);
        await publishAs(AUTH_URL, env);
        await waitFor(async () => (await wallets(userId)) === 1, 15_000);
        await sleep(1500); // let the duplicate be consumed too

        expect(await wallets(userId)).toBe(1);
        const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
        expect(wallet.balance).toBe(20);
        expect(await prisma.walletTransaction.count({ where: { walletId: wallet.id } })).toBe(1);
        expect(await prisma.processedEvent.count({ where: { consumer: 'finance', eventId: env.id } })).toBe(1);
    });

    it('retries a failed delivery after ~30s across a consumer restart, crediting once', async () => {
        const userId = uid();
        const env = createEnvelope(KEY, { userId, email: `${userId}@e2e.test` }, { source: 'auth' });

        // User row missing => FK violation => transient failure => finance.retry.30s.
        await publishAs(AUTH_URL, env);
        await sleep(2000);
        expect(await wallets(userId)).toBe(0);
        await stopWorker();
        await newUser(userId);
        await startWorker();

        await waitFor(async () => (await wallets(userId)) === 1, 40_000);
        await sleep(1000);
        expect(await wallets(userId)).toBe(1);
    }, 90_000);

    it('dead-letters an envelope whose source disagrees with the routing key', async () => {
        const conn = await amqp.connect(FINANCE_URL);
        const ch = await conn.createChannel();
        const before = (await ch.checkQueue('finance.dlq')).messageCount;
        const forged = { ...createEnvelope(KEY, { userId: uid() }, { source: 'auth' }), source: 'exam' };

        await publishAs(AUTH_URL, forged);
        await waitFor(async () => (await ch.checkQueue('finance.dlq')).messageCount > before, 10_000);
        await conn.close();
    });

    it('broker refuses finance publishing outside ^finance\\. and consuming auth.events', async () => {
        const conn = await amqp.connect(FINANCE_URL);

        const pub = await conn.createConfirmChannel();
        const closed = new Promise<{ code: number }>((resolve) => pub.on('error', resolve));
        pub.publish('examio.events', KEY, Buffer.from('{}'));
        expect((await closed).code).toBe(403);

        const ok = await conn.createConfirmChannel();
        ok.publish('examio.events', 'finance.wallet.created', Buffer.from('{}'));
        await ok.waitForConfirms(); // positive control: own prefix is allowed

        const sub = await conn.createChannel();
        const subErr = new Promise<{ code: number }>((resolve) => sub.on('error', resolve));
        await sub.consume('auth.events', () => undefined).catch(() => undefined);
        expect((await subErr).code).toBe(403);
        await conn.close().catch(() => undefined);
    });
});
