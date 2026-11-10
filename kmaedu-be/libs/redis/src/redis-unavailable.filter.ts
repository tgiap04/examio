import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    ServiceUnavailableException,
} from '@nestjs/common';

/**
 * ioredis does not export `MaxRetriesPerRequestError` (only a deep `built/errors` path), so Nest's
 * `@Catch` is given this matcher instead: `instanceof` is answered by the error's name.
 */
class MaxRetriesPerRequestError {
    static [Symbol.hasInstance](error: unknown): boolean {
        return error instanceof Error && error.name === 'MaxRetriesPerRequestError';
    }
}

/**
 * Maps a Redis connectivity failure on an HTTP request to
 * 503 SERVICE_UNAVAILABLE (same code the socket middleware emits) instead of a
 * generic 500. Other exceptions are untouched: it only catches ioredis'
 * "gave up waiting for a connection" error.
 */
@Catch(MaxRetriesPerRequestError)
export class RedisUnavailableFilter implements ExceptionFilter {
    catch(exception: Error, host: ArgumentsHost): void {
        if (host.getType() !== 'http') throw exception;
        const res = host.switchToHttp().getResponse();
        const ex = new ServiceUnavailableException({
            statusCode: 503,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Service temporarily unavailable',
        });
        res.status(ex.getStatus()).json(ex.getResponse());
    }
}
