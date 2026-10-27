import { HttpException } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { isGrpcUnavailable, toDocumentHttpException } from './document-errors';

const grpc = (code: number, details: string) => Object.assign(new Error(`${code} ${details}`), { code, details });
const body = (error: HttpException) => ({ status: error.getStatus(), ...(error.getResponse() as object) });

describe('toDocumentHttpException', () => {
    it.each([
        [status.RESOURCE_EXHAUSTED, 'QUOTA_EXCEEDED', 403, 'QUOTA_EXCEEDED'],
        [status.FAILED_PRECONDITION, 'INSUFFICIENT_CREDITS', 403, 'INSUFFICIENT_CREDITS'],
        [status.FAILED_PRECONDITION, 'WALLET_NOT_FOUND', 403, 'WALLET_NOT_FOUND'],
        [status.UNAVAILABLE, 'CHARGE_UNAVAILABLE', 403, 'CHARGE_UNAVAILABLE'],
        [status.UNAVAILABLE, 'STORAGE_UNAVAILABLE', 503, 'STORAGE_UNAVAILABLE'],
        [status.UNAVAILABLE, '', 503, 'SERVICE_UNAVAILABLE'],
        [status.DEADLINE_EXCEEDED, '', 503, 'SERVICE_UNAVAILABLE'],
        [status.ABORTED, 'UPLOAD_EXPIRED', 409, 'UPLOAD_EXPIRED'],
        [status.NOT_FOUND, 'NOT_FOUND', 404, 'NOT_FOUND'],
        [status.INVALID_ARGUMENT, 'VALIDATION_FAILED', 400, 'VALIDATION_FAILED'],
    ])('gRPC %i "%s" is HTTP %i %s, the shape every route answers with', (code, details, httpStatus, errorCode) => {
        const mapped = body(toDocumentHttpException(grpc(code, details)));
        expect(mapped).toMatchObject({ status: httpStatus, statusCode: httpStatus, code: errorCode });
        expect(typeof mapped['message' as keyof typeof mapped]).toBe('string');
    });

    it('quota and insufficient credits keep the 403 texts', () => {
        expect(JSON.stringify(toDocumentHttpException(grpc(status.FAILED_PRECONDITION, 'INSUFFICIENT_CREDITS')).getResponse())).toContain('Không đủ tín dụng');
        expect(JSON.stringify(toDocumentHttpException(grpc(status.FAILED_PRECONDITION, 'WALLET_NOT_FOUND')).getResponse())).toContain('Ví chưa được khởi tạo');
    });

    it('a caller can name its own NOT_FOUND code (ai-chat keeps DOCUMENT_NOT_FOUND)', () => {
        const mapped = body(
            toDocumentHttpException(grpc(status.NOT_FOUND, ''), { notFound: { code: 'DOCUMENT_NOT_FOUND', message: 'x' } })
        );
        expect(mapped).toMatchObject({ status: 404, code: 'DOCUMENT_NOT_FOUND', message: 'x' });
    });

    it('passes an HttpException through and never leaks the text of an unknown failure', () => {
        const original = new HttpException('nope', 418);
        expect(toDocumentHttpException(original)).toBe(original);
        const internal = toDocumentHttpException(new Error('select * from secrets failed'));
        expect(internal.getStatus()).toBe(500);
        expect(JSON.stringify(internal.getResponse())).not.toContain('secrets');
    });
});

describe('isGrpcUnavailable', () => {
    it('is true for UNAVAILABLE and DEADLINE_EXCEEDED only', () => {
        expect(isGrpcUnavailable(grpc(status.UNAVAILABLE, ''))).toBe(true);
        expect(isGrpcUnavailable(grpc(status.DEADLINE_EXCEEDED, ''))).toBe(true);
        expect(isGrpcUnavailable(grpc(status.NOT_FOUND, ''))).toBe(false);
        expect(isGrpcUnavailable(new Error('x'))).toBe(false);
    });
});
