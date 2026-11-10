import { HttpException } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { grpcErrorToHttpException } from '../grpc-error-map';

/** The HTTP shape every error answer carries: `{ statusCode, code, message }`. */
const http = (statusCode: number, code: string, message: string) =>
    new HttpException({ statusCode, code, message }, statusCode);

interface GrpcFailure {
    code?: number;
    details?: string;
    message?: string;
}

/** The detail text of a document-service failure is its error code (`STORAGE_UNAVAILABLE`, ...). */
export function documentErrorCode(error: unknown): string {
    return String((error as GrpcFailure | null)?.details ?? '').trim();
}

export const isGrpcStatus = (error: unknown, ...codes: number[]): boolean =>
    codes.includes((error as GrpcFailure | null)?.code ?? -1);

/** Overrides for callers whose clients read a different code/text for a missing or foreign document. */
export interface DocumentHttpOptions {
    notFound?: { code: string; message: string };
}

/**
 * Maps a DocumentService failure to the HTTP answer of a route acting for the caller (a missing or
 * foreign upload is 404, invalid input 400, an outage 503).
 */
export function toDocumentHttpException(error: unknown, options: DocumentHttpOptions = {}): HttpException {
    if (error instanceof HttpException) return error;
    const failure = error as GrpcFailure | null;
    const code = documentErrorCode(error);
    switch (failure?.code) {
        case status.NOT_FOUND:
            return options.notFound
                ? http(404, options.notFound.code, options.notFound.message)
                : http(404, 'NOT_FOUND', 'Upload không tồn tại');
        case status.INVALID_ARGUMENT:
            return http(400, 'VALIDATION_FAILED', code && code !== 'VALIDATION_FAILED' ? code : 'Dữ liệu không hợp lệ');
        case status.UNAVAILABLE:
            return http(503, code || 'SERVICE_UNAVAILABLE', 'Dịch vụ tài liệu tạm thời không khả dụng, vui lòng thử lại sau');
        case status.DEADLINE_EXCEEDED:
            return http(503, 'SERVICE_UNAVAILABLE', 'Dịch vụ tài liệu phản hồi quá chậm, vui lòng thử lại sau');
        default:
            return grpcErrorToHttpException(error);
    }
}

/** `.catch` handler for DocumentClient calls made on behalf of an HTTP request. */
export function rethrowAsDocumentHttp(error: unknown): never {
    throw toDocumentHttpException(error);
}

/** True for failures that mean "the service could not answer" (as opposed to a refusal). */
export const isGrpcUnavailable = (error: unknown): boolean =>
    isGrpcStatus(error, status.UNAVAILABLE, status.DEADLINE_EXCEEDED);
