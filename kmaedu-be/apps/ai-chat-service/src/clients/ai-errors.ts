import { HttpException } from '@nestjs/common';
import { Metadata, status } from '@grpc/grpc-js';
import { TimeoutError } from 'rxjs';

const ERROR_CODE_TRAILER = 'x-error-code';

interface GrpcFailure {
    code?: number;
    details?: string;
    metadata?: Metadata;
}

const http = (statusCode: number, code: string, message: string) =>
    new HttpException({ statusCode, code, message }, statusCode);

/** Both the stream idle timeout (rxjs) and a gRPC deadline. */
const aiTimeout = () => http(504, 'AI_TIMEOUT', 'AI phản hồi quá chậm, vui lòng thử lại.');

/** The model-error code ai-service puts in the trailers (MODEL_UNAVAILABLE, ...), when there is one. */
function modelErrorCode(error: GrpcFailure): string {
    return String(error.metadata?.get?.(ERROR_CODE_TRAILER)?.[0] ?? '').trim();
}

/** A refused or missing service token: our own wiring is wrong, so it must be loud, never a silent success. */
export function isAiAuthFailure(error: unknown): boolean {
    const code = (error as GrpcFailure | null)?.code;
    return code === status.UNAUTHENTICATED || code === status.PERMISSION_DENIED;
}

/**
 * Maps a failure of an ai-service call to the HTTP answer of the chat route. The raw upstream text is
 * never forwarded (ai-service already hides internals; this keeps it that way on the way out).
 */
export function toAiHttpException(error: unknown): HttpException {
    if (error instanceof HttpException) return error;
    if (error instanceof TimeoutError) return aiTimeout();
    const failure = (error ?? {}) as GrpcFailure;
    switch (failure.code) {
        case status.RESOURCE_EXHAUSTED:
            return http(429, 'AI_BUSY', 'AI đang quá tải, vui lòng thử lại sau ít phút.');
        case status.UNAVAILABLE:
            return http(
                503,
                modelErrorCode(failure) || 'AI_UNAVAILABLE',
                'Mô hình AI hiện không khả dụng, vui lòng thử lại sau.'
            );
        case status.DEADLINE_EXCEEDED:
            return aiTimeout();
        case status.INVALID_ARGUMENT:
            return http(400, 'AI_INVALID_REQUEST', 'Yêu cầu không hợp lệ với AI (nội dung quá dài hoặc sai định dạng).');
        case status.UNAUTHENTICATED:
        case status.PERMISSION_DENIED:
            return http(502, 'AI_UPSTREAM_REJECTED', 'Không thể kết nối tới dịch vụ AI.');
        default:
            return http(502, 'AI_UPSTREAM_ERROR', 'Dịch vụ AI gặp lỗi, vui lòng thử lại.');
    }
}

/**
 * Failures of the non-streaming `Query` that must reach the user as an HTTP error. Everything else
 * (model down, timeout, internal) keeps the friendly apology message the chat has always answered
 * with, so a chat does not break on a flaky model.
 */
export function shouldSurfaceAiFailure(error: unknown): boolean {
    const code = (error as GrpcFailure | null)?.code;
    return isAiAuthFailure(error) || code === status.RESOURCE_EXHAUSTED || code === status.INVALID_ARGUMENT;
}
