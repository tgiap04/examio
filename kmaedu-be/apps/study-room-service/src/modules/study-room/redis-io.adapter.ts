import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions, Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

export interface AdapterClients {
    pub: Redis;
    sub: Redis;
}

interface AdapterClientOptions {
    maxRetriesPerRequest?: number;
    retryDelayMs?: number;
}

const READY_TIMEOUT_MS = 10_000;

/**
 * Pub/sub clients for @socket.io/redis-adapter. The adapter fires subscribe and
 * publish commands without awaiting or catching them, so a command that
 * exhausts `maxRetriesPerRequest` during a Redis outage becomes an unhandled
 * rejection and kills the process. Hence:
 *  - `sub` retries forever (`maxRetriesPerRequest: null`): the subscribe is
 *    queued and ioredis re-subscribes after reconnect;
 *  - `sub` skips the ready-check (`INFO`) and `CLIENT SETINFO`: ioredis writes
 *    (p)subscribe while still connecting, and any command it issues after that
 *    is rejected with "Connection in subscriber mode", which closes the
 *    connection and loses the adapter's subscriptions;
 *  - `pub.publish` swallows (and logs) a failed publish: the broadcast is lost
 *    while Redis is down, which is the best an outage allows.
 */
export function createAdapterClients(
    conn: { host: string; port: number; password?: string },
    opts: AdapterClientOptions = {}
): AdapterClients {
    const retryStrategy = (times: number) =>
        opts.retryDelayMs ?? Math.min(times * 200, 5000);
    const pub = new Redis({
        ...conn,
        retryStrategy,
        maxRetriesPerRequest: opts.maxRetriesPerRequest ?? 20,
    });
    const sub = new Redis({
        ...conn,
        retryStrategy,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        disableClientInfo: true,
    });
    pub.on('error', (e) =>
        console.error('[StudyRoom Redis pub] error:', e.message)
    );
    sub.on('error', (e) =>
        console.error('[StudyRoom Redis sub] error:', e.message)
    );

    const publish = pub.publish.bind(pub) as (
        ...args: unknown[]
    ) => Promise<number>;
    (pub as unknown as { publish: typeof publish }).publish = (...args) =>
        publish(...args).catch((e: Error) => {
            console.error('[StudyRoom Redis pub] publish failed:', e.message);
            return 0;
        });
    return { pub, sub };
}

/**
 * Resolves once the client is `ready`, or after `timeoutMs` (Redis down at
 * boot must not block startup: the adapter then degrades until Redis is back).
 */
function whenReady(client: Redis, timeoutMs: number): Promise<boolean> {
    if (client.status === 'ready') return Promise.resolve(true);
    return new Promise((resolve) => {
        const done = (ok: boolean) => {
            clearTimeout(timer);
            client.off('ready', onReady);
            resolve(ok);
        };
        const onReady = () => done(true);
        const timer = setTimeout(() => done(false), timeoutMs);
        client.once('ready', onReady);
    });
}

// Socket.io adapter dùng Redis pub/sub để fan-out broadcast qua nhiều instance study-room-service.
// Không có adapter này thì client ở instance khác sẽ không nhận được event.
export class RedisIoAdapter extends IoAdapter {
    private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
    private clients: Redis[] = [];

    async connectToRedis(): Promise<void> {
        const { pub, sub } = createAdapterClients({
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT
                ? parseInt(process.env.REDIS_PORT, 10)
                : 6379,
            password: process.env.REDIS_PASSWORD,
        });
        this.clients = [pub, sub];
        // The adapter subscribes as soon as a namespace exists; do that only
        // once `sub` can actually take the subscription.
        const ready = await Promise.all([
            whenReady(pub, READY_TIMEOUT_MS),
            whenReady(sub, READY_TIMEOUT_MS),
        ]);
        if (ready.includes(false)) {
            console.error(
                '[StudyRoom Redis] not ready after %dms; cross-instance fan-out starts degraded',
                READY_TIMEOUT_MS
            );
        }
        // Own pub/sub channel namespace (`studyroom#…`) so phase 17's Redis ACL can scope it to this service.
        this.adapterConstructor = createAdapter(pub, sub, { key: 'studyroom' });
    }

    /** Closes the pub/sub connections (graceful shutdown and tests). */
    async dispose(): Promise<void> {
        await Promise.allSettled(this.clients.map((c) => c.quit()));
        this.clients = [];
    }

    createIOServer(port: number, options?: ServerOptions): Server {
        const server: Server = super.createIOServer(port, options);
        if (this.adapterConstructor) {
            server.adapter(this.adapterConstructor);
        }
        return server;
    }
}
