import type { ServerResponse } from 'http';
import type { Duplex } from 'stream';

/** Same shape as `HttpErrorEnvelopeFilter` (libs/http): the FE reads `message`. */
export interface GatewayErrorBody {
    statusCode: number;
    code: string;
    message: string;
    requestId: string;
}

const MESSAGES: Record<string, string> = {
    TOKEN_MISSING: 'Authentication token is required',
    TOKEN_EXPIRED: 'Authentication token has expired',
    TOKEN_INVALID: 'Authentication token is invalid',
    SESSION_REVOKED: 'This session has been signed out',
    TOKEN_STALE: 'Your permissions changed; refresh your session',
    AUTH_STATE_UNAVAILABLE: 'Authentication state is temporarily unavailable',
    EMAIL_NOT_VERIFIED: 'Email not verified',
    PERMISSION_DENIED: 'You do not have permission to perform this action',
    PAGE_DISABLED: 'This page is currently disabled',
    RATE_LIMITED: 'Too many requests, please retry later',
    PAYLOAD_TOO_LARGE: 'Request body is too large',
    ROUTE_NOT_FOUND: 'Route not found',
    UPSTREAM_UNAVAILABLE: 'Service unavailable',
    UPSTREAM_TIMEOUT: 'Service did not respond in time',
    INTERNAL_ERROR: 'Internal server error',
};

const STATUS_TEXT: Record<number, string> = {
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    413: 'Payload Too Large',
    500: 'Internal Server Error',
    429: 'Too Many Requests',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
};

export function errorBody(status: number, code: string, requestId: string): GatewayErrorBody {
    return {
        statusCode: status,
        code,
        message: MESSAGES[code] ?? STATUS_TEXT[status] ?? 'Error',
        requestId,
    };
}

/** Writes the envelope on a raw response (works before or without Express). */
export function sendError(
    res: ServerResponse,
    status: number,
    code: string,
    requestId: string,
    headers: Record<string, string> = {}
): void {
    if (res.headersSent) {
        res.end();
        return;
    }
    const body = JSON.stringify(errorBody(status, code, requestId));
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'X-Request-Id': requestId,
        ...headers,
    });
    res.end(body);
}

/** A refused WebSocket upgrade: a bare status line, then the socket is closed. */
export function rejectUpgrade(socket: Duplex, status: number, code: string): void {
    if (socket.writable) {
        socket.write(
            `HTTP/1.1 ${status} ${STATUS_TEXT[status] ?? 'Error'}\r\n` +
                `Connection: close\r\nContent-Length: 0\r\nX-Error-Code: ${code}\r\n\r\n`
        );
    }
    socket.destroy();
}
