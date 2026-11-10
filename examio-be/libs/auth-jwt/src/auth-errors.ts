import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

export const AUTH_ERROR_CODES = {
    TOKEN_MISSING: 'TOKEN_MISSING',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    TOKEN_INVALID: 'TOKEN_INVALID',
    EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    NO_AUTHZ_DECLARED: 'NO_AUTHZ_DECLARED',
} as const;

export type AuthErrorCode =
    (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

/** Raised by the verifier; the guard turns it into an HTTP or RPC error. */
export class TokenVerificationError extends Error {
    constructor(
        readonly code: Extract<AuthErrorCode, 'TOKEN_EXPIRED' | 'TOKEN_INVALID'>
    ) {
        super(code);
        this.name = 'TokenVerificationError';
    }
}

const UNAUTHENTICATED_CODES: ReadonlySet<AuthErrorCode> = new Set([
    AUTH_ERROR_CODES.TOKEN_MISSING,
    AUTH_ERROR_CODES.TOKEN_EXPIRED,
    AUTH_ERROR_CODES.TOKEN_INVALID,
]);

const MESSAGES: Record<AuthErrorCode, string> = {
    TOKEN_MISSING: 'Authentication token is required',
    TOKEN_EXPIRED: 'Authentication token has expired',
    TOKEN_INVALID: 'Authentication token is invalid',
    EMAIL_NOT_VERIFIED: 'Email not verified',
    PERMISSION_DENIED: 'You do not have permission to perform this action',
    NO_AUTHZ_DECLARED: 'No authorization declared for this endpoint',
};

/**
 * Builds the error for the current transport. HTTP: 401/403 with
 * `{ statusCode, code, message }`. RPC: UNAUTHENTICATED / PERMISSION_DENIED
 * with the code as the status detail (so `grpcErrorToHttpException` can
 * surface it unchanged).
 */
export function authError(
    code: AuthErrorCode,
    contextType: string
): Error {
    const unauthenticated = UNAUTHENTICATED_CODES.has(code);
    if (contextType === 'rpc') {
        return new RpcException({
            code: unauthenticated
                ? status.UNAUTHENTICATED
                : status.PERMISSION_DENIED,
            message: code,
        });
    }
    const body = {
        statusCode: unauthenticated ? 401 : 403,
        code,
        message: MESSAGES[code],
    };
    return unauthenticated
        ? new UnauthorizedException(body)
        : new ForbiddenException(body);
}
