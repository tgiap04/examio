import { createServer, AddressInfo } from 'net';
import Redis from 'ioredis';
import { io as connect, Socket } from 'socket.io-client';
import { RedisIoAdapter } from './redis-io.adapter';
import { StudyRoomGateway } from './study-room.gateway';

// Needs a real Redis: set REDIS_ADAPTER_TEST_PORT (127.0.0.1, optional
// REDIS_ADAPTER_TEST_PASSWORD) to run, skipped otherwise.
const PORT = process.env.REDIS_ADAPTER_TEST_PORT;
const PASSWORD = process.env.REDIS_ADAPTER_TEST_PASSWORD;
const describeReal = PORT ? describe : describe.skip;

const freePort = (): Promise<number> =>
    new Promise((resolve, reject) => {
        const s = createServer();
        s.once('error', reject);
        s.listen(0, '127.0.0.1', () => {
            const { port } = s.address() as AddressInfo;
            s.close(() => resolve(port));
        });
    });

const until = async (fn: () => Promise<boolean> | boolean, ms = 8000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (await fn()) return true;
        await new Promise((r) => setTimeout(r, 100));
    }
    return false;
};

describeReal('RedisIoAdapter against a real Redis', () => {
    let control: Redis;
    const adapters: RedisIoAdapter[] = [];
    const sockets: Socket[] = [];
    const servers: { close: () => unknown }[] = [];

    async function startInstance() {
        process.env.REDIS_HOST = '127.0.0.1';
        process.env.REDIS_PORT = PORT;
        if (PASSWORD) process.env.REDIS_PASSWORD = PASSWORD;
        else delete process.env.REDIS_PASSWORD;
        const adapter = new RedisIoAdapter();
        await adapter.connectToRedis();
        adapters.push(adapter);
        const port = await freePort();
        const server = adapter.createIOServer(port, {
            cors: { origin: true },
        } as never);
        servers.push(server);
        const client = connect(`http://127.0.0.1:${port}`, {
            transports: ['websocket'],
            forceNew: true,
        });
        sockets.push(client);
        await new Promise<void>((res, rej) => {
            client.once('connect', () => res());
            client.once('connect_error', rej);
        });
        server.on('connection', (s: { join: (r: string) => void }) =>
            s.join('room')
        );
        return { server, client };
    }

    beforeAll(() => {
        control = new Redis({
            host: '127.0.0.1',
            port: Number(PORT),
            password: PASSWORD,
        });
    });

    afterEach(async () => {
        sockets.splice(0).forEach((s) => s.close());
        servers.splice(0).forEach((s) => s.close());
        await Promise.all(adapters.splice(0).map((a) => a.dispose()));
    });

    afterAll(async () => {
        await control.quit();
    });

    // Connections that currently hold at least one (p)subscription.
    const subscribed = async () => {
        const list = (await control.call(
            'CLIENT',
            'LIST',
            'TYPE',
            'pubsub'
        )) as string;
        return list
            .split('\n')
            .filter((l) => /\b(sub|psub)=[1-9]/.test(l)).length;
    };

    it('resolves connectToRedis only once both pub and sub are ready', async () => {
        process.env.REDIS_HOST = '127.0.0.1';
        process.env.REDIS_PORT = PORT;
        if (PASSWORD) process.env.REDIS_PASSWORD = PASSWORD;
        const adapter = new RedisIoAdapter();
        adapters.push(adapter);
        await adapter.connectToRedis();
        const { clients } = adapter as unknown as { clients: Redis[] };
        expect(clients.map((c) => c.status)).toEqual(['ready', 'ready']);
    });

    it('subscribes the adapter patterns on startup', async () => {
        await startInstance();
        expect(await until(async () => (await subscribed()) >= 1)).toBe(true);
        expect(Number(await control.call('PUBSUB', 'NUMPAT'))).toBeGreaterThanOrEqual(1);
    });

    it('publishes only on channels under the study-room namespace (`studyroom#`)', async () => {
        const a = await startInstance();
        const b = await startInstance();
        a.server.sockets.sockets.forEach((s) => s.join('room'));
        await until(async () => (await subscribed()) >= 2);
        const watcher = control.duplicate();
        const seen: string[] = [];
        watcher.on('pmessage', (_pattern: string, channel: string) => seen.push(channel));
        try {
            await watcher.psubscribe('*');
            b.server.to('room').emit('x', 'probe');
            await until(async () => seen.length > 0);
        } finally {
            watcher.disconnect();
        }
        expect(seen.length).toBeGreaterThan(0);
        expect(seen.filter((c) => !c.startsWith('studyroom#'))).toEqual([]);
    });

    it('fans a broadcast from one instance out to a socket on another', async () => {
        const a = await startInstance();
        const b = await startInstance();
        // join happens on 'connection'; clients connected before the handler was set
        a.server.sockets.sockets.forEach((s) => s.join('room'));
        b.server.sockets.sockets.forEach((s) => s.join('room'));
        const got = new Promise<string>((res) => a.client.once('x', res));
        await until(async () => (await subscribed()) >= 2);
        b.server.to('room').emit('x', 'from-b');
        await expect(got).resolves.toBe('from-b');
    });

    it('restores the subscription after the pub/sub connections are killed', async () => {
        const a = await startInstance();
        const b = await startInstance();
        a.server.sockets.sockets.forEach((s) => s.join('room'));
        await until(async () => (await subscribed()) >= 2);
        await control.call('CLIENT', 'KILL', 'TYPE', 'pubsub');
        expect(
            await until(async () => (await subscribed()) >= 2, 15000)
        ).toBe(true);
        const got = new Promise<string>((res) => a.client.once('y', res));
        b.server.to('room').emit('y', 'after-kill');
        await expect(got).resolves.toBe('after-kill');
    });

    it('fetchSockets across instances works with sockets set up by the real gateway', async () => {
        const a = await startInstance();
        const b = await startInstance();
        // Instance B owns the socket; its data is built exactly as the gateway
        // does on connect (incl. the token-expiry timer). A fetches it remotely:
        // B serialises socket.data, which threw "circular structure" before.
        const gateway = new StudyRoomGateway(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            { setServer: jest.fn() } as never,
            {} as never
        );
        const uncaught: unknown[] = [];
        const onUncaught = (e: unknown) => uncaught.push(e);
        process.on('uncaughtException', onUncaught);
        try {
            const bSocket = [...b.server.sockets.sockets.values()][0];
            bSocket.data = {
                user: { id: 'u1' },
                av: 1,
                exp: Math.floor(Date.now() / 1000) + 600,
                rooms: new Set<string>(),
            };
            bSocket.join('room');
            gateway.handleConnection(bSocket as never);
            await until(async () => (await subscribed()) >= 2);
            const remote = await a.server.in('room').fetchSockets();
            expect(remote.map((r) => (r.data as { user: { id: string } }).user.id)).toContain('u1');
            await gateway.handleDisconnect(bSocket as never);
        } finally {
            process.off('uncaughtException', onUncaught);
        }
        expect(uncaught).toEqual([]);
    });
});
