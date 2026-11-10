import { HttpException } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { isGrpcUnavailable, toDocumentHttpException } from './document-errors';

const grpc = (code: number, details: string) => Object.assign(new Error(`${code} ${details}`), { code, details });
const body = (error: HttpException) => ({ status: error.getStatus(), ...(error.getResponse() as object) });

describe('toDocumentHttpException', () => {
    it.each([
        [status.UNAVAILABLE, 'STORAGE_UNAVAILABLE', 503, 'STORAGE_UNAVAILABLE'],
        [status.UNAVAILABLE, '', 503, 'SERVICE_UNAVAILABLE'],
        [status.DEADLINE_EXCEEDED, '', 503, 'SERVICE_UNAVAILABLE'],
        [status.NOT_FOUND, 'NOT_FOUND', 404, 'NOT_FOUND'],
        [status.INVALID_ARGUMENT, 'VALIDATION_FAILED', 400, 'VALIDATION_FAILED'],
    ])('gRPC %i "%s" is HTTP %i %s, the shape every route answers with', (code, details, httpStatus, errorCode) => {
        const mapped = body(toDocumentHttpException(grpc(code, details)));
        expect(mapped).toMatchObject({ status: httpStatus, statusCode: httpStatus, code: errorCode });
        expect(typeof mapped['message' as keyof typeof mapped]).toBe('string');
    });

    it.each([
        [status.RESOURCE_EXHAUSTED, 429, 'RESOURCE_EXHAUSTED'],
        [status.FAILED_PRECONDITION, 422, 'FAILED_PRECONDITION'],
        [status.ABORTED, 409, 'ABORTED'],
    ])('gRPC %i is no longer read as a quota / credit / expired-charge answer (generic HTTP %i %s)', (code, httpStatus, errorCode) => {
        expect(body(toDocumentHttpException(grpc(code, '')))).toMatchObject({ status: httpStatus, code: errorCode });
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
