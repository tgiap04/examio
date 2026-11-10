import * as amqp from 'amqplib';
import Redis from 'ioredis';
import { createEnvelope } from '@kmaedu/messaging';
import {
    bootStudyRoomApp,
    rid,
    type StudyRoomTestApp,
} from './support/study-room-test-app';
import { call } from './support/http';

/**
 * `auth.user.updated` through the real broker and the real consumer: the cached
 * public profile (`studyroom:cache:user:<id>`) is dropped, a replay or an
 * out-of-order version changes nothing and raises nothing, and the next read
 * is served from auth again.
 */
describe('auth.user.updated consumer (e2e)', () => {
    let t: StudyRoomTestApp;
    let redis: Redis;

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const cacheKey = (id: string) => `studyroom:cache:user:${id}`;

    async function waitFor(check: () => Promise<boolean>, ms = 8000) {
        const until = Date.now() + ms;
        while (Date.now() < until) {
            if (await check()) return;
            await sleep(100);
        }
        throw new Error('condition not met in time');
    }

    async function publishUpdated(userId: string, version: number) {
        const envelope = createEnvelope(
            'auth.user.updated',
            { userId, changed: ['name'], version },
            { source: 'auth' }
        );
        const conn = await amqp.connect(process.env.RABBITMQ_AUTH_URL as string);
        const ch = await conn.createConfirmChannel();
        ch.publish(
            'kmaedu.events',
            'auth.user.updated',
            Buffer.from(JSON.stringify(envelope)),
            { persistent: true, contentType: 'application/json', messageId: envelope.id }
        );
        await ch.waitForConfirms();
        await conn.close();
    }

    beforeAll(async () => {
        t = await bootStudyRoomApp();
        redis = new Redis({
            host: process.env.REDIS_HOST,
            port: Number(process.env.REDIS_PORT),
            password: process.env.REDIS_PASSWORD || undefined,
        });
    });

    afterAll(async () => {
        await redis.quit();
        await t.close();
    });

    it('drops the cached profile; a replay and an older version leave it empty with no error', async () => {
        const host = await t.createUser(['TEACHER']);
        const hostToken = await t.tokenFor(host);
        const created = await call(t.server, 'post', '/studyrooms', hostToken, {
            name: `cache room ${rid()}`,
        });
        expect(created.status).toBe(201);
        // The roster read enriches members through auth and fills the cache.
        const detail = await call(t.server, 'get', `/studyrooms/${created.body.id}`, hostToken);
        expect(detail.status).toBe(200);
        await waitFor(async () => (await redis.exists(cacheKey(host.id))) === 1);

        await publishUpdated(host.id, 5);
        await waitFor(async () => (await redis.exists(cacheKey(host.id))) === 0);

        await publishUpdated(host.id, 5); // replay
        await publishUpdated(host.id, 3); // out of order
        await sleep(1500);
        expect(await redis.exists(cacheKey(host.id))).toBe(0);

        // The service keeps serving, and the next read refetches from auth.
        t.auth.reset();
        const again = await call(t.server, 'get', `/studyrooms/${created.body.id}`, hostToken);
        expect(again.status).toBe(200);
        expect(t.auth.calls.profileBatches.flat()).toContain(host.id);
    });

    it('ignores a malformed payload (dead-lettered) and keeps consuming', async () => {
        const conn = await amqp.connect(process.env.RABBITMQ_AUTH_URL as string);
        const ch = await conn.createConfirmChannel();
        const envelope = createEnvelope('auth.user.updated', { version: 1, changed: [] }, { source: 'auth' });
        ch.publish('kmaedu.events', 'auth.user.updated', Buffer.from(JSON.stringify(envelope)), {
            persistent: true,
            contentType: 'application/json',
            messageId: envelope.id,
        });
        await ch.waitForConfirms();
        await conn.close();

        const u = await t.createUser(['TEACHER']);
        const token = await t.tokenFor(u);
        const room = await call(t.server, 'post', '/studyrooms', token, { name: `after ${rid()}` });
        expect(room.status).toBe(201);
        await call(t.server, 'get', `/studyrooms/${room.body.id}`, token);
        await waitFor(async () => (await redis.exists(cacheKey(u.id))) === 1);
        await publishUpdated(u.id, 1);
        await waitFor(async () => (await redis.exists(cacheKey(u.id))) === 0);
    });
});
