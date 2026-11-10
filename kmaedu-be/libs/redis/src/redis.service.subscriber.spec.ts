import { RedisService } from './redis.service';

jest.mock('ioredis', () => {
    const { EventEmitter } = require('events');
    return {
        __esModule: true,
        default: class FakeRedis extends EventEmitter {
            subscribe = jest.fn().mockResolvedValue(1);
            quit = jest.fn();
        },
    };
});

describe('RedisService subscriber client', () => {
    it('has an error listener so an outage is logged, not thrown as an unhandled error event', async () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const service = new RedisService();
        service.onModuleInit();
        await service.subscribe('chan', () => undefined);
        const sub = (service as unknown as { subscriber: import('events').EventEmitter })
            .subscriber;

        expect(sub.listenerCount('error')).toBeGreaterThan(0);
        expect(() => sub.emit('error', new Error('ECONNREFUSED'))).not.toThrow();
        spy.mockRestore();
    });
});
