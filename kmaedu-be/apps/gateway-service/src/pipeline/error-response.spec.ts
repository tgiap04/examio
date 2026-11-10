import type { ServerResponse } from 'http';
import type { Duplex } from 'stream';
import { errorBody, rejectUpgrade, sendError } from './error-response';

function response(headersSent = false) {
    const res = {
        headersSent,
        writeHead: jest.fn().mockReturnThis(),
        end: jest.fn().mockReturnThis(),
    };
    return { res, asRes: res as unknown as ServerResponse };
}

describe('errorBody', () => {
    it('is the envelope shared with HttpErrorEnvelopeFilter', () => {
        expect(errorBody(401, 'TOKEN_EXPIRED', 'req_1')).toEqual({
            statusCode: 401,
            code: 'TOKEN_EXPIRED',
            message: 'Authentication token has expired',
            requestId: 'req_1',
        });
    });

    it.each([
        'TOKEN_MISSING', 'TOKEN_EXPIRED', 'TOKEN_INVALID', 'SESSION_REVOKED', 'TOKEN_STALE',
        'AUTH_STATE_UNAVAILABLE', 'EMAIL_NOT_VERIFIED', 'PERMISSION_DENIED', 'PAGE_DISABLED',
        'RATE_LIMITED', 'PAYLOAD_TOO_LARGE', 'ROUTE_NOT_FOUND', 'UPSTREAM_UNAVAILABLE',
        'UPSTREAM_TIMEOUT', 'INTERNAL_ERROR',
    ])('%s has a human message', (code) => {
        expect(errorBody(400, code, 'r').message).not.toBe('Error');
    });

    it('falls back to the status text, then a generic message, for an unknown code', () => {
        expect(errorBody(429, 'WHATEVER', 'r').message).toBe('Too Many Requests');
        expect(errorBody(418, 'WHATEVER', 'r').message).toBe('Error');
    });
});

describe('sendError', () => {
    it('writes status, JSON content headers, the request id, extra headers and the body', () => {
        const { res, asRes } = response();
        sendError(asRes, 429, 'RATE_LIMITED', 'req_9', { 'Retry-After': '12' });
        const body = JSON.stringify(errorBody(429, 'RATE_LIMITED', 'req_9'));
        expect(res.writeHead).toHaveBeenCalledWith(429, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(body),
            'X-Request-Id': 'req_9',
            'Retry-After': '12',
        });
        expect(res.end).toHaveBeenCalledWith(body);
    });

    it('only ends the response when headers were already sent (a stream cannot become an error)', () => {
        const { res, asRes } = response(true);
        sendError(asRes, 502, 'UPSTREAM_UNAVAILABLE', 'r');
        expect(res.writeHead).not.toHaveBeenCalled();
        expect(res.end).toHaveBeenCalledWith();
    });
});

describe('rejectUpgrade', () => {
    const socket = (writable: boolean) => {
        const s = { writable, write: jest.fn(), destroy: jest.fn() };
        return { s, asSocket: s as unknown as Duplex };
    };

    it('writes a bare status line with the error code, then closes the socket', () => {
        const { s, asSocket } = socket(true);
        rejectUpgrade(asSocket, 401, 'TOKEN_MISSING');
        const written = s.write.mock.calls[0][0] as string;
        expect(written.startsWith('HTTP/1.1 401 Unauthorized\r\n')).toBe(true);
        expect(written).toContain('X-Error-Code: TOKEN_MISSING');
        expect(written.endsWith('\r\n\r\n')).toBe(true);
        expect(s.destroy).toHaveBeenCalledTimes(1);
    });

    it('just destroys a socket that is no longer writable', () => {
        const { s, asSocket } = socket(false);
        rejectUpgrade(asSocket, 429, 'RATE_LIMITED');
        expect(s.write).not.toHaveBeenCalled();
        expect(s.destroy).toHaveBeenCalledTimes(1);
    });
});
