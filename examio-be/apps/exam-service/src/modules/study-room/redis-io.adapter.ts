import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions, Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

// Socket.io adapter dùng Redis pub/sub để fan-out broadcast qua nhiều instance exam-service.
// Không có adapter này thì client ở instance khác sẽ không nhận được event.
export class RedisIoAdapter extends IoAdapter {
    private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
    private clients: Redis[] = [];

    async connectToRedis(): Promise<void> {
        const opts = {
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT
                ? parseInt(process.env.REDIS_PORT, 10)
                : 6379,
            password: process.env.REDIS_PASSWORD,
        };
        const pubClient = new Redis(opts);
        const subClient = pubClient.duplicate();
        pubClient.on('error', (e) =>
            console.error('[StudyRoom Redis pub] error:', e.message)
        );
        subClient.on('error', (e) =>
            console.error('[StudyRoom Redis sub] error:', e.message)
        );
        this.clients = [pubClient, subClient];
        this.adapterConstructor = createAdapter(pubClient, subClient);
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
