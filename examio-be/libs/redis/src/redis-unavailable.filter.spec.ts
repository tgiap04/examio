import { MaxRetriesPerRequestError } from 'ioredis/built/errors';
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

describe('RedisUnavailableFilter', () => {
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
