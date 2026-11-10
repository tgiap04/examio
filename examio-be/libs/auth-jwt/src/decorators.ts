import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import type { Permission } from './permissions';

export const PUBLIC_KEY = 'authz:public';
export const AUTHENTICATED_KEY = 'authz:authenticated';
export const ALLOW_UNVERIFIED_KEY = 'allowUnverified';
export const PERMISSIONS_KEY = 'authz:permissions';
export const SERVICE_ONLY_KEY = 'authz:service-only';
export const PERMISSIONS_OR_SERVICE_KEY = 'authz:permissions-or-service';

export interface OrServiceOptions {
    /** Allowed service names; omitted = any service token. */
    callers?: string[];
}

/** No authentication required. A token that fails verification is ignored (anonymous). */
export const Public = (): CustomDecorator => SetMetadata(PUBLIC_KEY, true);

/** Any verified user (no permission needed). Unverified emails get 403 unless `@AllowUnverified()`. */
export const Authenticated = (): CustomDecorator =>
    SetMetadata(AUTHENTICATED_KEY, true);

/**
 * Lets a user whose email is not yet verified through `@Authenticated()`.
 * Only the handlers an unverified user needs to finish onboarding may carry
 * it; `apps/auth-service/test/allow-unverified-allowlist.spec.ts` pins them.
 */
export const AllowUnverified = (): CustomDecorator =>
    SetMetadata(ALLOW_UNVERIFIED_KEY, true);

/** User token holding EVERY listed permission (AND). Service tokens are rejected. */
export const RequirePermissions = (
    ...permissions: Permission[]
): CustomDecorator => SetMetadata(PERMISSIONS_KEY, permissions);

/** Service token whose `svc:<name>` is one of `callers` (at least one). */
export function ServiceOnly(...callers: string[]): CustomDecorator {
    if (callers.length === 0) {
        throw new Error('@ServiceOnly needs at least one allowed caller');
    }
    return SetMetadata(SERVICE_ONLY_KEY, callers);
}

/**
 * A verified user holding `permissions` (empty = any verified user) OR a
 * service token from `options.callers` (omitted = any service).
 */
export const RequirePermissionsOrService = (
    permissions: Permission[],
    options: OrServiceOptions = {}
): CustomDecorator =>
    SetMetadata(PERMISSIONS_OR_SERVICE_KEY, {
        permissions,
        callers: options.callers,
    });

export type Declaration =
    | { kind: 'public' }
    | { kind: 'authenticated' }
    | { kind: 'permissions'; permissions: Permission[] }
    | { kind: 'service-only'; callers: string[] }
    | { kind: 'permissions-or-service'; permissions: Permission[]; callers?: string[] };

/** Reads one target's own declaration metadata (no inheritance between targets). */
export function declarationOf(
    get: <T>(key: string) => T | undefined
): Declaration | undefined {
    if (get<boolean>(PUBLIC_KEY)) return { kind: 'public' };
    const orService = get<{ permissions: Permission[]; callers?: string[] }>(
        PERMISSIONS_OR_SERVICE_KEY
    );
    if (orService) return { kind: 'permissions-or-service', ...orService };
    const callers = get<string[]>(SERVICE_ONLY_KEY);
    if (callers) return { kind: 'service-only', callers };
    const permissions = get<Permission[]>(PERMISSIONS_KEY);
    if (permissions) return { kind: 'permissions', permissions };
    if (get<boolean>(AUTHENTICATED_KEY)) return { kind: 'authenticated' };
    return undefined;
}
