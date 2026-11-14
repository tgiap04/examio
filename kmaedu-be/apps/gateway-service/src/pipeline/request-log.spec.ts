import { EventEmitter } from 'events';
import { Logger } from '@nestjs/common';
import { RequestLog } from './request-log';

function setup(options: { reject?: Error; closed?: boolean } = {}) {
    const publisher = {
        register: jest.fn(),
        publish: jest.fn(async () => {
            if (options.reject) throw options.reject;
        }),
        isClosed: jest.fn(() => options.closed ?? false),
    };
    const log = new RequestLog(publisher as never);
    const res = Object.assign(new EventEmitter(), { statusCode: 200 });
    const req = { method: 'GET', originalUrl: '/api/v1/x?token=SECRET', url: '/api/v1/x?token=SECRET' };
    log.attach(req as never, res as never);
    return { publisher, res };
}

const flush = () => new Promise((r) => setImmediate(r));

describe('RequestLog', () => {
    let error: jest.SpyInstance;
    let info: jest.SpyInstance;
    beforeEach(() => {
        error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
        info = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    });
    afterEach(() => jest.restoreAllMocks());

    it('registers the gateway log stream', () => {
        const { publisher } = setup();
        expect(publisher.register).toHaveBeenCalledWith('gateway');
    });

    it('on finish publishes today\'s line (full url, the publisher redacts) and logs it without the query', async () => {
        const { publisher, res } = setup();
        res.emit('finish');
        await flush();
        expect(publisher.publish).toHaveBeenCalledWith('gateway', expect.stringMatching(/^→ GET \/api\/v1\/x\?token=SECRET 200 \d+ms$/));
        expect(info).toHaveBeenCalledWith(expect.not.stringContaining('SECRET'));
    });

    it('a publish failure is logged, never thrown into the response path', async () => {
        const { res } = setup({ reject: new Error('redis blip') });
        res.emit('finish');
        await flush();
        expect(error).toHaveBeenCalledWith(expect.stringContaining('redis blip'));
    });

    it('a publish that fails because Redis is already closed (shutdown) is not an error', async () => {
        const { res } = setup({ reject: new Error('Connection is closed.'), closed: true });
        res.emit('finish');
        await flush();
        expect(error).not.toHaveBeenCalled();
    });

    it('publishes once per response', async () => {
        const { publisher, res } = setup();
        res.emit('finish');
        res.emit('finish');
        await flush();
        expect(publisher.publish).toHaveBeenCalledTimes(1);
    });
});
