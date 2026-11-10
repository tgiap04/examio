import type { Type } from '@nestjs/common';
import type { Permission } from './permissions';

export const OWNER_OR_PERMISSION_KEY = 'authz:owner-or-permission';

/** Minimal request slice a resolver may read (`params`, `body`, `query`, `user`). */
export interface OwnerResolverRequest {
    params?: Record<string, string>;
    body?: unknown;
    query?: Record<string, unknown>;
    user?: unknown;
}

/**
 * Resolves the owner of the resource a request names. One cheap
 * `findUnique ... select { userId }`; `null` when the resource is missing.
 * Implementations must be providers of the module that owns the controller.
 */
export interface OwnerResolver {
    resolveOwnerId(req: OwnerResolverRequest): Promise<string | null>;
}

export interface OwnerOrPermissionMetadata {
    permission: Permission;
    resolver: Type<OwnerResolver>;
}
