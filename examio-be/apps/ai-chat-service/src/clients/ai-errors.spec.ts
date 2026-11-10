import { HttpException } from '@nestjs/common';
import { Metadata, status } from '@grpc/grpc-js';
import { TimeoutError } from 'rxjs';
import { isAiAuthFailure, toAiHttpException } from './ai-errors';

const grpc = (code: number, details = '', trailers: Record<string, string> = {}) => {
    const metadata = new Metadata();
    for (const [k, v] of Object.entries(trailers)) metadata.set(k, v);
    return { code, details, message: `${code} ${details}`, metadata };
};
const body = (e: HttpException) => e.getResponse() as { statusCode: number; code: string; message: string };

describe('toAiHttpException', () => {
    it.each([
        [status.RESOURCE_EXHAUSTED, 429, 'AI_BUSY'],
        [status.UNAVAILABLE, 503, 'AI_UNAVAILABLE'],
        [status.DEADLINE_EXCEEDED, 504, 'AI_TIMEOUT'],
        [status.INVALID_ARGUMENT, 400, 'AI_INVALID_REQUEST'],
        [status.UNAUTHENTICATED, 502, 'AI_UPSTREAM_REJECTED'],
        [status.PERMISSION_DENIED, 502, 'AI_UPSTREAM_REJECTED'],
        [status.INTERNAL, 502, 'AI_UPSTREAM_ERROR'],
        [status.UNKNOWN, 502, 'AI_UPSTREAM_ERROR'],
    ])('gRPC status %s answers HTTP %s (%s)', (code, http, errorCode) => {
        const error = toAiHttpException(grpc(code, 'detail'));
        expect(error.getStatus()).toBe(http);
        expect(body(error)).toMatchObject({ statusCode: http, code: errorCode });
    });

    it('an idle stream (rxjs TimeoutError) is a 504', () => {
        const error = toAiHttpException(new TimeoutError());
        expect(error.getStatus()).toBe(504);
        expect(body(error).code).toBe('AI_TIMEOUT');
    });

    it('keeps the model error code of an UNAVAILABLE answer for support, not the raw text', () => {
        const error = toAiHttpException(grpc(status.UNAVAILABLE, 'secret internals', { 'x-error-code': 'MODEL_INSUFFICIENT_VRAM' }));
        expect(body(error).code).toBe('MODEL_INSUFFICIENT_VRAM');
        expect(JSON.stringify(body(error))).not.toContain('secret internals');
    });

    it('never leaks the upstream text of an INTERNAL failure', () => {
        const error = toAiHttpException(grpc(status.INTERNAL, 'Traceback: /srv/app/secret.py'));
        expect(JSON.stringify(body(error))).not.toContain('secret.py');
    });

    it('anything that is not a gRPC error is a 502', () => {
        expect(toAiHttpException(new Error('socket hang up')).getStatus()).toBe(502);
    });

    it('passes an HttpException through untouched', () => {
        const original = new HttpException('x', 418);
        expect(toAiHttpException(original)).toBe(original);
    });
});

describe('isAiAuthFailure', () => {
    it('is true only for a refused or missing service token', () => {
        expect(isAiAuthFailure(grpc(status.UNAUTHENTICATED))).toBe(true);
        expect(isAiAuthFailure(grpc(status.PERMISSION_DENIED))).toBe(true);
        expect(isAiAuthFailure(grpc(status.UNAVAILABLE))).toBe(false);
        expect(isAiAuthFailure(new TimeoutError())).toBe(false);
    });
});
