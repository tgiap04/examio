import { ServiceUnavailableException } from '@nestjs/common';
import { FILTER_CATCH_EXCEPTIONS } from '@nestjs/common/constants';
import { RedisUnavailableFilter } from './redis-unavailable.filter';

function http() {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    return {
        status,
        json,
        host: {
            getType: () => 'http',
            switchToHttp: () => ({ getResponse: () => ({ status }) }),
        } as never,
    };
}

/** ioredis does not export its error classes: the error is recognised by name, like a real one. */
class MaxRetriesPerRequestError extends Error {
    constructor(times: number) {
        super(`Reached the max retries per request limit (which is ${times}).`);
        this.name = 'MaxRetriesPerRequestError';
    }
}

describe('RedisUnavailableFilter', () => {
    it('is selected by Nest for an error named MaxRetriesPerRequestError and for nothing else', () => {
        const [metatype] = Reflect.getMetadata(FILTER_CATCH_EXCEPTIONS, RedisUnavailableFilter) as Array<new () => unknown>;
        expect(new MaxRetriesPerRequestError(20) instanceof metatype).toBe(true);
        expect(new Error('boom') instanceof metatype).toBe(false);
        expect(new ServiceUnavailableException() instanceof metatype).toBe(false);
    });

    it('answers 503 SERVICE_UNAVAILABLE for an ioredis max-retries error', () => {
        const h = http();
        new RedisUnavailableFilter().catch(new MaxRetriesPerRequestError(20), h.host);
        expect(h.status).toHaveBeenCalledWith(503);
        expect(h.json).toHaveBeenCalledWith(
            expect.objectContaining({ statusCode: 503, code: 'SERVICE_UNAVAILABLE' })
        );
    });

    it('re-throws outside HTTP', () => {
        const err = new MaxRetriesPerRequestError(20);
        expect(() =>
            new RedisUnavailableFilter().catch(err, { getType: () => 'ws' } as never)
        ).toThrow(err as unknown as Error);
    });
});
