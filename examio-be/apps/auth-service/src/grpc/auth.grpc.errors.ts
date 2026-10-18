import { HttpException } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

export const fail = (code: status, message: string): never => {
    throw new RpcException({ code, message });
};

const HTTP_TO_GRPC: ReadonlyMap<number, status> = new Map([
    [400, status.INVALID_ARGUMENT],
    [401, status.UNAUTHENTICATED],
    [403, status.PERMISSION_DENIED],
    [404, status.NOT_FOUND],
    [409, status.ABORTED],
]);

/**
 * Service layer errors (HttpException with `{code}`) cross gRPC as a status
 * plus the UPPER_SNAKE code as detail, which `grpcErrorToHttpException` turns
 * back into the same `{ statusCode, code }` on the admin side.
 */
export function toRpcError(err: unknown): never {
    if (err instanceof RpcException) throw err;
    if (err instanceof HttpException) {
        const body = err.getResponse() as { code?: string; message?: string };
        throw new RpcException({
            code: HTTP_TO_GRPC.get(err.getStatus()) ?? status.INTERNAL,
            message: body.code ?? body.message ?? 'Request failed',
        });
    }
    throw err;
}
