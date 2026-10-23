import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import { createAdapterClients } from './redis-io.adapter';

// Port 1 is closed: every command waits for a connection that never comes.
const DEAD = { host: '127.0.0.1', port: 1 };

describe('createAdapterClients (Redis unreachable)', () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    let quit: () => Promise<void>;

    beforeEach(() => {
        unhandled.length = 0;
        process.on('unhandledRejection', onUnhandled);
    });

    afterEach(async () => {
        process.off('unhandledRejection', onUnhandled);
        await quit?.();
    });

    it('does not leak an unhandled rejection from the adapter subscribe/publish calls', async () => {
        const clients = createAdapterClients(DEAD, {
            maxRetriesPerRequest: 1,
            retryDelayMs: 20,
        });
        quit = async () => {
            clients.pub.disconnect();
            clients.sub.disconnect();
        };
        const io = new Server({ adapter: createAdapter(clients.pub, clients.sub) });
        io.of('/');
        io.to('room').emit('x', 1);
        await new Promise((r) => setTimeout(r, 400));
        expect(unhandled).toEqual([]);
    });

    it('keeps an error listener on both clients', () => {
        const { pub, sub } = createAdapterClients(DEAD);
        quit = async () => {
            pub.disconnect();
            sub.disconnect();
        };
        expect(pub.listenerCount('error')).toBeGreaterThan(0);
        expect(sub.listenerCount('error')).toBeGreaterThan(0);
    });
});
