import { AddressInfo } from 'net';
import * as amqp from 'amqplib';
import Redis from 'ioredis';
import { io, type Socket } from 'socket.io-client';
import { createEnvelope } from '@examio/messaging';
import {
    bootExamApp,
    rid,
    type ExamTestApp,
    type TestUser,
} from './ownership/support/exam-test-app';
import { call } from './ownership/support/http';

/**
 * Message-level e2e for /ws/study (real socket.io over HTTP, real Postgres,
 * Redis adapter, RabbitMQ consumer). RABBITMQ_URL = exam (service under
 * test), RABBITMQ_AUTH_URL = auth (publishes authz_changed).
 */
describe('study-room websocket authz (e2e)', () => {
    let t: ExamTestApp;
    let url: string;
    let redis: Redis;
    let teacher: TestUser;
    let roomId: string;
    const open: Socket[] = [];

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    function connect(token: string): Socket {
        const s = io(url, {
            path: '/ws/study',
            transports: ['websocket'],
            auth: { token },
            reconnection: false,
            forceNew: true,
        });
        open.push(s);
        return s;
    }

    const once = <T = unknown>(
        s: Socket,
        event: string,
        ms = 8000
    ): Promise<T> =>
        new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error(`timeout waiting for ${event}`)),
                ms
            );
            s.once(event, (payload: T) => {
                clearTimeout(timer);
                resolve(payload);
            });
        });

    const connected = (s: Socket) => once(s, 'connect');
    const rejection = async (s: Socket): Promise<string> =>
        (await once<Error>(s, 'connect_error')).message;

    async function member(roles: Array<'STUDENT' | 'TEACHER'>) {
        const user = await t.createUser(roles);
        const token = await t.tokenFor(user);
        const res = await call(
            t.server,
            'post',
            `/studyrooms/${roomId}/join`,
            token,
            {}
        );
        expect(res.status).toBe(201);
        return { user, token };
    }

    async function publishAuthzChanged(userId: string, authzVersion: number) {
        const envelope = createEnvelope(
            'auth.user.authz_changed',
            {
                userId,
                authzVersion,
                role: 'STUDENT',
                isSystemAdmin: false,
                isBanned: false,
                reason: 'role',
            },
            { source: 'auth' }
        );
        const conn = await amqp.connect(
            process.env.RABBITMQ_AUTH_URL as string
        );
        const ch = await conn.createConfirmChannel();
        ch.publish(
            'examio.events',
            'auth.user.authz_changed',
            Buffer.from(JSON.stringify(envelope)),
            {
                persistent: true,
                contentType: 'application/json',
                messageId: envelope.id,
            }
        );
        await ch.waitForConfirms();
        await conn.close();
    }

    beforeAll(async () => {
        t = await bootExamApp({ listen: true, redisAdapter: true });
        url = `http://127.0.0.1:${(t.server.address() as AddressInfo).port}`;
        redis = new Redis({
            host: process.env.REDIS_HOST,
            port: Number(process.env.REDIS_PORT),
        });
        teacher = await t.createUser(['TEACHER']);
        const created = await call(
            t.server,
            'post',
            '/studyrooms',
            await t.tokenFor(teacher),
            {
                name: `ws room ${rid()}`,
                accessType: 0,
            }
        );
        expect(created.status).toBe(201);
        roomId = created.body.id;
    });

    afterAll(async () => {
        open.forEach((s) => s.close());
        // Let the server finish its async disconnect work (presence, focus flush)
        // before the app and its Redis connections close.
        await sleep(1000);
        await redis.quit();
        await t.close();
    });

    it('STUDENT connects, joins the room and a chat reaches a second member', async () => {
        const a = await member(['STUDENT']);
        const b = await member(['STUDENT']);
        const sa = connect(a.token);
        const sb = connect(b.token);
        await Promise.all([connected(sa), connected(sb)]);

        const snapA = once(sa, 'room:snapshot');
        sa.emit('room:join', { roomId });
        await snapA;
        const snapB = once(sb, 'room:snapshot');
        sb.emit('room:join', { roomId });
        await snapB;

        const received = once<{ message: { content: string; userId: string } }>(
            sb,
            'chat:message'
        );
        sa.emit('chat:send', { roomId, content: 'hello from a student' });
        const { message } = await received;
        expect(message.content).toBe('hello from a student');
        expect(message.userId).toBe(a.user.id);
    });

    it('a SYSTEM_ADMIN-only token is refused with PERMISSION_DENIED', async () => {
        const admin = await t.createUser(['SYSTEM_ADMIN']);
        const s = connect(await t.tokenFor(admin));
        expect(await rejection(s)).toBe('PERMISSION_DENIED');
    });

    it('an unverified email is refused with EMAIL_NOT_VERIFIED', async () => {
        const u = await t.createUser(['STUDENT']);
        const s = connect(await t.tokenFor(u, { emailVerified: false }));
        expect(await rejection(s)).toBe('EMAIL_NOT_VERIFIED');
    });

    it('a missing or garbage token is refused', async () => {
        expect(await rejection(connect(''))).toBe('TOKEN_MISSING');
        expect(await rejection(connect('not-a-jwt'))).toBe('TOKEN_INVALID');
    });

    it('a stale token (av below the gateway mirror) is refused with TOKEN_STALE', async () => {
        const u = await t.createUser(['STUDENT']);
        await redis.set(`gw:user:${u.id}:av`, '5');
        const s = connect(await t.tokenFor({ ...u, av: 4 }));
        expect(await rejection(s)).toBe('TOKEN_STALE');
        const fresh = connect(await t.tokenFor({ ...u, av: 5 }));
        await connected(fresh);
    });

    it('authz_changed with a higher version sends auth:reauth {AUTHZ_CHANGED} then disconnects', async () => {
        const m = await member(['STUDENT']);
        const s = connect(m.token);
        await connected(s);
        const reauth = once<{ reason: string }>(s, 'auth:reauth');
        const closed = once(s, 'disconnect');
        await publishAuthzChanged(m.user.id, 1);
        expect(await reauth).toEqual({ reason: 'AUTHZ_CHANGED' });
        await closed;
        expect(s.connected).toBe(false);
    });

    it('authz_changed leaves a socket with an equal or newer token alone (idempotent)', async () => {
        const u = await t.createUser(['STUDENT']);
        const s = connect(await t.tokenFor({ ...u, av: 3 }));
        await connected(s);
        let disconnected = false;
        s.on('disconnect', () => (disconnected = true));
        await publishAuthzChanged(u.id, 3);
        await sleep(1500);
        expect(disconnected).toBe(false);
        expect(s.connected).toBe(true);
    });

    it('a token that expires while connected gets auth:reauth {TOKEN_EXPIRED} then a disconnect', async () => {
        const u = await t.createUser(['STUDENT']);
        const s = connect(await t.tokenFor(u, { expiresInSeconds: 2 }));
        await connected(s);
        const reauth = once<{ reason: string }>(s, 'auth:reauth', 6000);
        const closed = once(s, 'disconnect', 6000);
        expect(await reauth).toEqual({ reason: 'TOKEN_EXPIRED' });
        await closed;
    });
});
