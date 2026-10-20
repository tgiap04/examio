import { EventEmitter } from 'events';
import { ConfigService } from '@nestjs/config';

const order: string[] = [];
const channels: Array<EventEmitter & { close: jest.Mock }> = [];
const manager = Object.assign(new EventEmitter(), {
    createChannel: jest.fn(() => {
        const ch = Object.assign(new EventEmitter(), {
            close: jest.fn(async () => {
                await new Promise((r) => setTimeout(r, 5));
                order.push('channel');
            }),
        });
        channels.push(ch);
        return ch;
    }),
    close: jest.fn(async () => {
        order.push('manager');
    }),
});
jest.mock('amqp-connection-manager', () => ({ connect: () => manager }));

import { RabbitMQService } from './rabbitmq.service';

describe('RabbitMQService', () => {
    const service = new RabbitMQService({
        get: () => 'amqp://x',
    } as unknown as ConfigService);

    beforeAll(async () => {
        await service.onModuleInit();
    });

    it('gives every channel an error listener that logs instead of throwing', () => {
        const ch = service.createChannel({ json: true });
        expect(
            (ch as unknown as EventEmitter).listenerCount('error')
        ).toBeGreaterThan(0);
        expect(() =>
            (ch as unknown as EventEmitter).emit(
                'error',
                new Error('Channel ended'),
                { name: 'q' }
            )
        ).not.toThrow();
    });

    it('closes the channels before the connection and awaits both', async () => {
        service.createChannel({ json: true });
        await service.onModuleDestroy();
        expect(order.slice(-1)).toEqual(['manager']);
        expect(order.filter((o) => o === 'channel').length).toBe(
            channels.length
        );
        expect(order.indexOf('manager')).toBeGreaterThan(
            order.lastIndexOf('channel')
        );
    });
});
