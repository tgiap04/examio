import { randomUUID } from 'crypto';
import { join } from 'path';
import { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as amqp from 'amqplib';
import * as request from 'supertest';
import { createEnvelope } from '@examio/messaging';
import { HEALTH_ROUTES_EXCLUDED_FROM_PREFIX } from '@examio/observability';

/**
 * Real Postgres + RabbitMQ (rendered definitions). RABBITMQ_URL connects as
 * the `auth` broker user.
 */
const KEY = 'auth.user.registered';
const prisma = new PrismaClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => Promise<T | null | false>, ms: number): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
        const v = await fn();
        if (v) return v;
        if (Date.now() > end) throw new Error('waitFor timed out');
        await sleep(200);
    }
}

const row = (id: string) => prisma.outboxEvent.findUnique({ where: { id } });

describe('auth register -> outbox -> relay (e2e)', () => {
    const originalCwd = process.cwd();
    const emails: string[] = [];
    const eventIds: string[] = [];
    let api: INestApplication;
    let worker: INestApplicationContext | undefined;

    beforeAll(async () => {
        process.chdir(join(__dirname, '..', '..', '..'));
        const { AuthServiceModule } = await import('../src/auth-service.module');
        const moduleRef = await Test.createTestingModule({ imports: [AuthServiceModule] }).compile();
        api = moduleRef.createNestApplication();
        api.setGlobalPrefix('api/v1', { exclude: HEALTH_ROUTES_EXCLUDED_FROM_PREFIX });
        await api.init();
    });

    afterAll(async () => {
        await worker?.close();
        await Promise.race([api?.close(), sleep(5000)]);
        await prisma.outboxEvent.deleteMany({ where: { id: { in: eventIds } } });
        await prisma.userSubscription.deleteMany({ where: { user: { email: { in: emails } } } });
        await prisma.userSession.deleteMany({ where: { user: { email: { in: emails } } } });
        await prisma.user.deleteMany({ where: { email: { in: emails } } });
        await prisma.$disconnect();
        process.chdir(originalCwd);
    });

    it('register returns 201 and writes exactly one outbox row (source auth), unpublished', async () => {
        const tag = randomUUID().slice(0, 8);
        const email = `outbox_${tag}@e2e.test`;
        emails.push(email);

        const res = await request(api.getHttpServer())
            .post('/api/v1/auth/register')
            .send({ username: `ob_${tag}`, email, password: 'Passw0rd!Passw0rd', utmSource: 'e2e' });
        expect(res.status).toBe(201);

        const userId = res.body.user.id as string;
        const rows = await prisma.outboxEvent.findMany({
            where: { type: KEY, envelope: { path: ['data', 'userId'], equals: userId } },
        });
        expect(rows).toHaveLength(1);
        eventIds.push(rows[0].id);
        expect(rows[0].source).toBe('auth');
        expect(rows[0].publishedAt).toBeNull();
        expect(rows[0].envelope).toMatchObject({
            type: KEY,
            version: 1,
            source: 'auth',
            data: { userId, email, utmSource: 'e2e' },
        });
    });

    it('the relay publishes due rows, skips locked ones and re-claims expired locks', async () => {
        const past = new Date(Date.now() - 60_000);
        const future = new Date(Date.now() + 10 * 60_000);
        const mk = async (lockedUntil: Date | null) => {
            const env = createEnvelope(KEY, { userId: `relay_${randomUUID().slice(0, 8)}` }, { source: 'auth' });
            eventIds.push(env.id);
            await prisma.outboxEvent.create({
                data: { id: env.id, source: 'auth', type: KEY, envelope: env as object, lockedUntil },
            });
            return env.id;
        };
        const lockedId = await mk(future);
        const expiredId = await mk(past);
        const freeId = await mk(null);

        // Capture what reaches the broker on a private queue.
        const conn = await amqp.connect(process.env.RABBITMQ_URL as string);
        const ch = await conn.createChannel();
        // A fresh broker has no exchange until a service declares it.
        await ch.assertExchange('examio.events', 'topic', { durable: true });
        const q = await ch.assertQueue('auth.e2e-capture', { exclusive: true, autoDelete: true });
        await ch.bindQueue(q.queue, 'examio.events', KEY);
        const seen = new Set<string>();
        await ch.consume(q.queue, (m) => m && seen.add(String(m.properties.messageId)), { noAck: true });

        const { WorkerModule } = await import('../src/worker.module');
        worker = await NestFactory.createApplicationContext(WorkerModule, { logger: ['error', 'warn'] });

        await waitFor(async () => (await row(freeId))?.publishedAt, 15_000);
        await waitFor(async () => (await row(expiredId))?.publishedAt, 15_000);
        await sleep(1500);

        expect((await row(lockedId))?.publishedAt).toBeNull();
        expect((await row(freeId))?.lockedUntil).toBeNull();
        await waitFor(async () => seen.has(freeId) && seen.has(expiredId), 5000);
        expect(seen.has(lockedId)).toBe(false);
        await conn.close();
    });
});
