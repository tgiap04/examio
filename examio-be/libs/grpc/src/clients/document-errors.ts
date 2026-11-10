import { ForbiddenException, HttpException } from '@nestjs/common';
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

/** The detail text of a document-service failure is its error code (`QUOTA_EXCEEDED`, ...). */
export function documentErrorCode(error: unknown): string {
    return String((error as GrpcFailure | null)?.details ?? '').trim();
}

export const isGrpcStatus = (error: unknown, ...codes: number[]): boolean =>
    codes.includes((error as GrpcFailure | null)?.code ?? -1);

/** Charge refusals read the same on every route that spends credits (the text finance-client used to give). */
export const insufficientCredits = () =>
    http(403, 'INSUFFICIENT_CREDITS', 'Không đủ tín dụng: Insufficient balance. Vui lòng nạp thêm.');
export const walletNotFound = () =>
    http(403, 'WALLET_NOT_FOUND', 'Ví chưa được khởi tạo, vui lòng thử lại sau hoặc liên hệ hỗ trợ.');
/** Finance refused the caller (no `wallet:use`) or the debit request itself: definitive, nothing was taken. */
export const chargeForbidden = () => http(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện giao dịch tín dụng này.');
export const chargeInvalid = () => http(400, 'VALIDATION_FAILED', 'Yêu cầu giao dịch tín dụng không hợp lệ.');
export const chargeUnavailable = () =>
    new ForbiddenException({
        statusCode: 403,
        code: 'CHARGE_UNAVAILABLE',
        message: 'Không thể thực hiện giao dịch tín dụng lúc này.',
    });

/** Overrides for callers whose clients read a different code/text for a missing or foreign document. */
export interface DocumentHttpOptions {
    notFound?: { code: string; message: string };
}

/**
 * Maps a DocumentService failure to the HTTP answer of a route acting for the caller (quota and
 * insufficient credits are 403, a missing or foreign upload 404, an outage 503).
 */
export function toDocumentHttpException(error: unknown, options: DocumentHttpOptions = {}): HttpException {
    if (error instanceof HttpException) return error;
    const failure = error as GrpcFailure | null;
    const code = documentErrorCode(error);
    switch (failure?.code) {
        case status.RESOURCE_EXHAUSTED:
            return http(
                403,
                'QUOTA_EXCEEDED',
                'Bạn đã đạt giới hạn file/tháng. Vui lòng nâng cấp gói hoặc thử lại vào tháng sau.'
            );
        case status.FAILED_PRECONDITION:
            return code === 'WALLET_NOT_FOUND' ? walletNotFound() : insufficientCredits();
        case status.NOT_FOUND:
            return options.notFound
                ? http(404, options.notFound.code, options.notFound.message)
                : http(404, 'NOT_FOUND', 'Upload không tồn tại');
        case status.ABORTED:
            return http(409, code || 'UPLOAD_EXPIRED', 'Upload đã hết hạn, vui lòng thử lại');
        case status.INVALID_ARGUMENT:
            return http(400, 'VALIDATION_FAILED', code && code !== 'VALIDATION_FAILED' ? code : 'Dữ liệu không hợp lệ');
        case status.UNAVAILABLE:
            return code === 'CHARGE_UNAVAILABLE'
                ? chargeUnavailable()
                : http(503, code || 'SERVICE_UNAVAILABLE', 'Dịch vụ tài liệu tạm thời không khả dụng, vui lòng thử lại sau');
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
