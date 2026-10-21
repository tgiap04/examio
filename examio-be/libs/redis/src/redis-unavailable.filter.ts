import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    ServiceUnavailableException,
} from '@nestjs/common';
import { MaxRetriesPerRequestError } from 'ioredis/built/errors';

/**
 * Maps a Redis connectivity failure on an HTTP request to
 * 503 SERVICE_UNAVAILABLE (same code the socket middleware emits) instead of a
 * generic 500. Other exceptions are untouched: it only catches ioredis'
 * "gave up waiting for a connection" error.
 */
@Catch(MaxRetriesPerRequestError)
export class RedisUnavailableFilter implements ExceptionFilter {
    catch(_exception: MaxRetriesPerRequestError, host: ArgumentsHost): void {
        if (host.getType() !== 'http') throw _exception;
        const res = host.switchToHttp().getResponse();
        const ex = new ServiceUnavailableException({
            statusCode: 503,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Service temporarily unavailable',
        });
        res.status(ex.getStatus()).json(ex.getResponse());
    }
}
