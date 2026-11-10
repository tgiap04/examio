import {
    CanActivate,
    Injectable,
    Logger,
    type ExecutionContext,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { AUTH_ERROR_CODES, authError } from './auth-errors';
import {
    OWNER_OR_PERMISSION_KEY,
    type OwnerOrPermissionMetadata,
    type OwnerResolver,
    type OwnerResolverRequest,
} from './owner-or-permission.types';
import { hasPermission } from './permissions';
import { getPrincipal } from './principal';

/**
 * Per-handler guard behind `@RequireOwnerOrPermission`. Runs after the global
 * `JwtAuthGuard` / `PermissionsGuard` (which already required a verified user).
 */
@Injectable()
export class OwnerOrPermissionGuard implements CanActivate {
    private readonly logger = new Logger(OwnerOrPermissionGuard.name);

    constructor(
        private readonly reflector: Reflector,
        private readonly moduleRef: ModuleRef
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const type = context.getType<string>();
        if (type === 'ws') return true;

        const meta = this.reflector.get<OwnerOrPermissionMetadata | undefined>(
            OWNER_OR_PERMISSION_KEY,
            context.getHandler()
        );
        if (!meta) throw authError(AUTH_ERROR_CODES.NO_AUTHZ_DECLARED, type);

        const principal = getPrincipal(context);
        if (!principal) throw authError(AUTH_ERROR_CODES.TOKEN_MISSING, type);
        if (principal.kind !== 'user') {
            throw authError(AUTH_ERROR_CODES.PERMISSION_DENIED, type);
        }
        if (hasPermission(principal.roles, meta.permission)) return true;

        const resolver = this.moduleRef.get<OwnerResolver>(meta.resolver, {
            strict: false,
        });
        const req = context.switchToHttp().getRequest<OwnerResolverRequest>();
        const ownerId = await resolver.resolveOwnerId(req);
        if (ownerId !== null && ownerId === principal.id) return true;

        // 403 only on a permission denial; the log never says whether the resource exists.
        const route = req as { method?: string; route?: { path?: string } };
        this.logger.warn(
            `403 PERMISSION_DENIED userId=${principal.id} route=${route.method ?? ''} ${route.route?.path ?? ''} perm=${meta.permission}`
        );
        throw authError(AUTH_ERROR_CODES.PERMISSION_DENIED, type);
    }
}
