import { CanActivate, Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_ERROR_CODES, authError, type AuthErrorCode } from './auth-errors';
import { hasPermission, type Permission } from './permissions';
import { getPrincipal } from './principal';
import { allowsUnverified, resolveDeclaration } from './resolve-declaration';
import type { AuthUser, ServiceCaller } from './types';

/**
 * Authorization from the route declaration. Deny by default: a handler with no
 * declaration is refused (403 NO_AUTHZ_DECLARED). Must run after
 * `JwtAuthGuard`. WebSocket contexts are skipped (see `JwtAuthGuard`).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const type = context.getType<string>();
        if (type === 'ws') return true;

        const deny = (code: AuthErrorCode): never => {
            throw authError(code, type);
        };

        const declaration = resolveDeclaration(this.reflector, context);
        if (!declaration) return deny(AUTH_ERROR_CODES.NO_AUTHZ_DECLARED);
        if (declaration.kind === 'public') return true;

        const principal = getPrincipal(context);
        if (!principal) return deny(AUTH_ERROR_CODES.TOKEN_MISSING);

        const requireVerified = (user: AuthUser, allowUnverifiedFlag: boolean) => {
            if (!user.emailVerified && !allowUnverifiedFlag) {
                deny(AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED);
            }
        };
        const userHolds = (user: AuthUser, permissions: Permission[]) =>
            hasPermission(user.roles, ...permissions);
        const serviceAllowed = (svc: ServiceCaller, callers?: string[]) =>
            !callers || callers.includes(svc.name);

        switch (declaration.kind) {
            case 'authenticated':
                if (principal.kind !== 'user') return deny(AUTH_ERROR_CODES.PERMISSION_DENIED);
                requireVerified(principal, allowsUnverified(this.reflector, context));
                return true;
            case 'permissions':
                if (principal.kind !== 'user') return deny(AUTH_ERROR_CODES.PERMISSION_DENIED);
                requireVerified(principal, false);
                if (!userHolds(principal, declaration.permissions)) {
                    return deny(AUTH_ERROR_CODES.PERMISSION_DENIED);
                }
                return true;
            case 'service-only':
                if (principal.kind !== 'service' || !serviceAllowed(principal, declaration.callers)) {
                    return deny(AUTH_ERROR_CODES.PERMISSION_DENIED);
                }
                return true;
            case 'permissions-or-service':
                if (principal.kind === 'service') {
                    if (!serviceAllowed(principal, declaration.callers)) {
                        return deny(AUTH_ERROR_CODES.PERMISSION_DENIED);
                    }
                    return true;
                }
                requireVerified(principal, false);
                if (!userHolds(principal, declaration.permissions)) {
                    return deny(AUTH_ERROR_CODES.PERMISSION_DENIED);
                }
                return true;
        }
    }
}
