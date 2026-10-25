import { HttpException } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { grpcErrorToHttpException } from '@examio/grpc';

const http = (statusCode: number, code: string, message: string) =>
    new HttpException({ statusCode, code, message }, statusCode);

interface GrpcFailure {
    code?: number;
    details?: string;
}

export const isGrpcStatus = (error: unknown, ...codes: number[]): boolean =>
    codes.includes((error as GrpcFailure | null)?.code ?? -1);

/** True for failures that mean "the service could not answer" (as opposed to a refusal). */
export const isGrpcUnavailable = (error: unknown): boolean =>
    isGrpcStatus(error, status.UNAVAILABLE, status.DEADLINE_EXCEEDED);

/**
 * Maps a DocumentService failure to the HTTP answer of an AI chat route. A document that is missing
 * or belongs to someone else is the same 404 (no existence oracle); an outage is a 503.
 */
export function toDocumentHttpException(error: unknown): HttpException {
    if (error instanceof HttpException) return error;
    switch ((error as GrpcFailure | null)?.code) {
        case status.NOT_FOUND:
            return http(404, 'DOCUMENT_NOT_FOUND', 'Tài liệu không tồn tại');
        case status.INVALID_ARGUMENT:
            return http(400, 'VALIDATION_FAILED', 'Dữ liệu tài liệu không hợp lệ');
        case status.UNAVAILABLE:
        case status.DEADLINE_EXCEEDED:
            return http(503, 'SERVICE_UNAVAILABLE', 'Dịch vụ tài liệu tạm thời không khả dụng, vui lòng thử lại sau');
        default:
            return grpcErrorToHttpException(error);
    }
}
