import { HttpException } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';

/** Stable error codes carried in the HTTP body (`code`) and mapped to gRPC statuses. */
export const DocumentErrorCode = {
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    STORAGE_KEY_TAKEN: 'STORAGE_KEY_TAKEN',
    STORAGE_UNAVAILABLE: 'STORAGE_UNAVAILABLE',
    NOT_FOUND: 'NOT_FOUND',
    VALIDATION_FAILED: 'VALIDATION_FAILED',
} as const;
export type DocumentErrorCodeValue = (typeof DocumentErrorCode)[keyof typeof DocumentErrorCode];

export function documentError(httpStatus: number, code: DocumentErrorCodeValue, message: string): HttpException {
    return new HttpException({ statusCode: httpStatus, code, message }, httpStatus);
}

const CODE_TO_GRPC: Partial<Record<string, number>> = {
    [DocumentErrorCode.STORAGE_UNAVAILABLE]: status.UNAVAILABLE,
    [DocumentErrorCode.STORAGE_KEY_TAKEN]: status.ALREADY_EXISTS,
    [DocumentErrorCode.NOT_FOUND]: status.NOT_FOUND,
    [DocumentErrorCode.VALIDATION_FAILED]: status.INVALID_ARGUMENT,
};

const HTTP_TO_GRPC: Record<number, number> = {
    400: status.INVALID_ARGUMENT,
    403: status.PERMISSION_DENIED,
    404: status.NOT_FOUND,
    409: status.ALREADY_EXISTS,
    503: status.UNAVAILABLE,
};

/** gRPC face of a service error: HttpExceptions keep their meaning, anything else is INTERNAL. */
export function toRpcException(err: unknown): RpcException {
    if (err instanceof RpcException) return err;
    if (err instanceof HttpException) {
        const body = err.getResponse() as { code?: string; message?: string } | string;
        const code = typeof body === 'object' ? body.code : undefined;
        const message = typeof body === 'object' ? (body.message ?? err.message) : body;
        const grpc = (code && CODE_TO_GRPC[code]) ?? HTTP_TO_GRPC[err.getStatus()] ?? status.INTERNAL;
        return new RpcException({ code: grpc, message: code ?? message });
    }
    return new RpcException({ code: status.INTERNAL, message: 'Internal error' });
}
