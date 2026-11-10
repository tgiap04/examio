import { EventEmitter } from 'events';

const channels: Array<{ close: jest.Mock; setup: (ch: unknown) => Promise<unknown>; publish: jest.Mock; emitter: EventEmitter; on: jest.Mock }> = [];
let manager: EventEmitter & {
    createChannel: jest.Mock;
    isConnected: jest.Mock;
    close: jest.Mock;
};
const order: string[] = [];
const connectMock = jest.fn();

jest.mock('amqp-connection-manager', () => ({
    connect: (...args: unknown[]) => connectMock(...args),
}));

import { AmqpConnection } from './amqp-connection';

function makeManager() {
    const m = new EventEmitter() as typeof manager;
    m.isConnected = jest.fn().mockReturnValue(true);
    m.close = jest.fn(async () => {
        order.push('manager');
    });
    m.createChannel = jest.fn((opts: { setup: (ch: unknown) => Promise<unknown> }) => {
        const idx = channels.length;
        const emitter = new EventEmitter();
        const channel = {
            emitter,
            on: jest.fn((event: string, fn: (...a: unknown[]) => void) => emitter.on(event, fn)),
            setup: opts.setup,
            publish: jest.fn().mockResolvedValue(true),
            close: jest.fn(async () => {
                order.push(idx === 0 ? 'publisher' : `consumer${idx}`);
            }),
        };
        channels.push(channel);
        return channel;
    });
    return m;
}

describe('AmqpConnection', () => {
    const OLD = process.env.RABBITMQ_URL;

    beforeEach(() => {
        channels.length = 0;
        order.length = 0;
        manager = makeManager();
        connectMock.mockReset().mockReturnValue(manager);
        process.env.RABBITMQ_URL = 'amqp://u:p@broker:5672';
    });

    afterAll(() => {
        process.env.RABBITMQ_URL = OLD;
    });

    it('every channel has an error listener, so a "Channel ended" never becomes an unhandled crash', () => {
        const conn = new AmqpConnection({ service: 'auth' });
        conn.createConsumerChannel(async () => undefined);
        expect(channels).toHaveLength(2);
        for (const ch of channels) {
            expect(ch.emitter.listenerCount('error')).toBeGreaterThan(0);
            expect(() => ch.emitter.emit('error', new Error('Channel ended, no reply will be forthcoming'), { name: 'x' })).not.toThrow();
        }
    });

    it('requires RABBITMQ_URL', () => {
        delete process.env.RABBITMQ_URL;
        expect(() => new AmqpConnection({ service: 'auth' })).toThrow(/RABBITMQ_URL/);
    });

    it('connects with a 1 s reconnect delay and reports connection state', () => {
        const conn = new AmqpConnection({ service: 'auth' });

        expect(connectMock).toHaveBeenCalledWith(['amqp://u:p@broker:5672'], { reconnectTimeInSeconds: 1 });
        expect(conn.isConnected()).toBe(true);
        manager.isConnected.mockReturnValue(false);
        expect(conn.isConnected()).toBe(false);
    });

    it('declares the service topology in the publisher channel setup', async () => {
        const conn = new AmqpConnection({ service: 'auth' });
        const ch = {
            assertExchange: jest.fn().mockResolvedValue({}),
            assertQueue: jest.fn().mockResolvedValue({}),
            bindQueue: jest.fn().mockResolvedValue({}),
        };

        await channels[0].setup(ch);

        expect(ch.assertQueue).toHaveBeenCalledWith('auth.events', expect.anything());
        await conn.publisher.publish('kmaedu.events', 'auth.x', Buffer.from('{}'), {});
        expect(channels[0].publish).toHaveBeenCalled();
    });

    it('tolerates connect/disconnect events without throwing', () => {
        new AmqpConnection({ service: 'auth' });
        expect(() => {
            manager.emit('connect');
            manager.emit('disconnect', { err: new Error('boom') });
            manager.emit('disconnect', {});
        }).not.toThrow();
    });

    it('closes consumer channels, then the publisher, then the connection', async () => {
        const conn = new AmqpConnection({ service: 'finance' });
        conn.createConsumerChannel(async () => undefined);

        await conn.onApplicationShutdown();

        expect(order).toEqual(['consumer1', 'publisher', 'manager']);
    });

    it('does not hang when a channel close never resolves (bounded wait)', async () => {
        jest.useFakeTimers();
        try {
            const conn = new AmqpConnection({ service: 'finance' });
            channels[0].close.mockReturnValue(new Promise(() => undefined));

            const done = conn.onApplicationShutdown();
            await jest.advanceTimersByTimeAsync(5000);
            await done;

            expect(manager.close).toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });

    it('swallows close failures so shutdown always completes', async () => {
        const conn = new AmqpConnection({ service: 'finance' });
        channels[0].close.mockRejectedValue(new Error('channel gone'));
        manager.close.mockRejectedValue(new Error('conn gone'));

        await expect(conn.onApplicationShutdown()).resolves.toBeUndefined();
    });
});
