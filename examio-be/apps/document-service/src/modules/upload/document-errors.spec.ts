import { HttpException } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { DocumentErrorCode, documentError, toRpcException } from './document-errors';

const rpcCode = (error: unknown) => (toRpcException(error).getError() as { code: number; message: string });

describe('toRpcException', () => {
    it.each([
        [DocumentErrorCode.STORAGE_UNAVAILABLE, 500, status.UNAVAILABLE],
        [DocumentErrorCode.STORAGE_KEY_TAKEN, 409, status.ALREADY_EXISTS],
        [DocumentErrorCode.NOT_FOUND, 404, status.NOT_FOUND],
        [DocumentErrorCode.VALIDATION_FAILED, 400, status.INVALID_ARGUMENT],
    ])('%s (HTTP %i) maps to gRPC %i and carries the code as the detail', (code, http, grpc) => {
        expect(rpcCode(documentError(http, code, 'text'))).toEqual({ code: grpc, message: code });
    });

    it('no charge or quota code exists any more', () => {
        for (const code of ['QUOTA_EXCEEDED', 'INSUFFICIENT_CREDITS', 'WALLET_NOT_FOUND', 'CHARGE_UNAVAILABLE', 'UPLOAD_EXPIRED']) {
            expect(Object.values(DocumentErrorCode)).not.toContain(code);
        }
    });

    it('falls back to the HTTP status for exceptions without a known code', () => {
        expect(rpcCode(new HttpException('nope', 404)).code).toBe(status.NOT_FOUND);
        expect(rpcCode(new HttpException('bad', 400)).code).toBe(status.INVALID_ARGUMENT);
    });

    it('never leaks the text of an unexpected error', () => {
        expect(rpcCode(new Error('select * from secrets'))).toEqual({ code: status.INTERNAL, message: 'Internal error' });
    });

    it('passes an RpcException through untouched', () => {
        const original = new RpcException({ code: status.PERMISSION_DENIED, message: 'PERMISSION_DENIED' });
        expect(toRpcException(original)).toBe(original);
    });
});
