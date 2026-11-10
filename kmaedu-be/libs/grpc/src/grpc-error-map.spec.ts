import { HttpException } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { grpcErrorToHttpException, grpcStatusToHttp } from './grpc-error-map';

describe('grpcStatusToHttp', () => {
    const table: Array<[string, number, number]> = [
        ['INVALID_ARGUMENT', status.INVALID_ARGUMENT, 400],
        ['UNAUTHENTICATED', status.UNAUTHENTICATED, 401],
        ['PERMISSION_DENIED', status.PERMISSION_DENIED, 403],
        ['NOT_FOUND', status.NOT_FOUND, 404],
        ['ALREADY_EXISTS', status.ALREADY_EXISTS, 409],
        ['ABORTED', status.ABORTED, 409],
        ['FAILED_PRECONDITION', status.FAILED_PRECONDITION, 422],
        ['RESOURCE_EXHAUSTED', status.RESOURCE_EXHAUSTED, 429],
        ['UNIMPLEMENTED', status.UNIMPLEMENTED, 501],
        ['UNAVAILABLE', status.UNAVAILABLE, 503],
        ['DEADLINE_EXCEEDED', status.DEADLINE_EXCEEDED, 504],
        ['INTERNAL', status.INTERNAL, 500],
        ['UNKNOWN', status.UNKNOWN, 500],
    ];

    it.each(table)('%s -> %i', (_name, code, http) => {
        expect(grpcStatusToHttp(code)).toBe(http);
    });

    it('falls back to 500 for unmapped codes', () => {
        expect(grpcStatusToHttp(9999)).toBe(500);
    });
});

describe('grpcErrorToHttpException', () => {
    it('builds { statusCode, code, message } from the status', () => {
        const ex = grpcErrorToHttpException({
            code: status.NOT_FOUND,
            details: 'user missing',
            message: '5 NOT_FOUND: user missing',
        });
        expect(ex).toBeInstanceOf(HttpException);
        expect(ex.getStatus()).toBe(404);
        expect(ex.getResponse()).toEqual({
            statusCode: 404,
            code: 'NOT_FOUND',
            message: 'user missing',
        });
    });

    it('uses an UPPER_SNAKE detail as the business code', () => {
        const ex = grpcErrorToHttpException({
            code: status.FAILED_PRECONDITION,
            details: 'INSUFFICIENT_BALANCE',
        });
        expect(ex.getStatus()).toBe(422);
        expect(ex.getResponse()).toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    });

    it('maps non-gRPC errors to 500 INTERNAL without leaking the message', () => {
        const ex = grpcErrorToHttpException(new Error('boom: secret'));
        expect(ex.getStatus()).toBe(500);
        expect(ex.getResponse()).toEqual({
            statusCode: 500,
            code: 'INTERNAL',
            message: 'Internal error',
        });
    });

    it('returns an existing HttpException untouched', () => {
        const original = new HttpException('x', 418);
        expect(grpcErrorToHttpException(original)).toBe(original);
    });
});
