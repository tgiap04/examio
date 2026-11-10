import { HttpException } from '@nestjs/common';
import { status } from '@grpc/grpc-js';

const GRPC_TO_HTTP: ReadonlyMap<number, number> = new Map([
    [status.INVALID_ARGUMENT, 400],
    [status.OUT_OF_RANGE, 400],
    [status.UNAUTHENTICATED, 401],
    [status.PERMISSION_DENIED, 403],
    [status.NOT_FOUND, 404],
    [status.ALREADY_EXISTS, 409],
    [status.ABORTED, 409],
    [status.FAILED_PRECONDITION, 422],
    [status.RESOURCE_EXHAUSTED, 429],
    [status.CANCELLED, 499],
    [status.INTERNAL, 500],
    [status.UNKNOWN, 500],
    [status.DATA_LOSS, 500],
    [status.UNIMPLEMENTED, 501],
    [status.UNAVAILABLE, 503],
    [status.DEADLINE_EXCEEDED, 504],
]);

const UPPER_SNAKE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

interface GrpcLikeError {
    code: number;
    details?: string;
    message?: string;
}

function isGrpcError(err: unknown): err is GrpcLikeError {
    return (
        typeof err === 'object' &&
        err !== null &&
        typeof (err as GrpcLikeError).code === 'number' &&
        status[(err as GrpcLikeError).code] !== undefined
    );
}

export function grpcStatusToHttp(code: number): number {
    return GRPC_TO_HTTP.get(code) ?? 500;
}

/**
 * Converts a gRPC client error into the HttpException shape services throw
 * (`{ statusCode, code, message }`). `code` is the gRPC status name, or the
 * server-supplied UPPER_SNAKE detail (e.g. INSUFFICIENT_BALANCE) when present.
 * Non-gRPC errors collapse to 500 without leaking their message.
 */
export function grpcErrorToHttpException(err: unknown): HttpException {
    if (err instanceof HttpException) return err;
    if (!isGrpcError(err)) {
        return new HttpException(
            { statusCode: 500, code: 'INTERNAL', message: 'Internal error' },
            500
        );
    }
    const statusCode = grpcStatusToHttp(err.code);
    const details = err.details?.trim();
    const code =
        details && UPPER_SNAKE.test(details) ? details : status[err.code];
    return new HttpException(
        {
            statusCode,
            code,
            message: details || err.message || status[err.code],
        },
        statusCode
    );
}
