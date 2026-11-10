import {
    CanActivate,
    Inject,
    Injectable,
    type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
    AUTH_ERROR_CODES,
    TokenVerificationError,
    authError,
} from './auth-errors';
import { extractHttpToken, extractRpcToken } from './extract-token';
import { setPrincipal } from './principal';
import { resolveDeclaration } from './resolve-declaration';
import type { TokenVerifier } from './verify';

export const TOKEN_VERIFIER = Symbol('AUTH_JWT_TOKEN_VERIFIER');

/**
 * Authentication only: verifies the token statelessly (no DB) and attaches the
 * principal. `@Public()` handlers treat a missing or invalid token as
 * anonymous. WebSocket contexts are skipped: socket auth lives in the socket
 * `server.use` middleware. Authorization is `PermissionsGuard`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        @Inject(TOKEN_VERIFIER) private readonly verify: TokenVerifier
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const type = context.getType<string>();
        if (type === 'ws') return true;

        const isPublic = resolveDeclaration(this.reflector, context)?.kind === 'public';
        const token =
            type === 'rpc'
                ? extractRpcToken(context.switchToRpc().getContext())
                : extractHttpToken(context.switchToHttp().getRequest());

        if (!token) {
            if (isPublic) return true;
            throw authError(AUTH_ERROR_CODES.TOKEN_MISSING, type);
        }

        try {
            setPrincipal(context, await this.verify(token));
        } catch (err) {
            if (isPublic) return true;
            if (err instanceof TokenVerificationError) {
                throw authError(err.code, type);
            }
            throw authError(AUTH_ERROR_CODES.TOKEN_INVALID, type);
        }
        return true;
    }
}
