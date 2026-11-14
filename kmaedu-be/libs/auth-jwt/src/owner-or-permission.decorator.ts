import {
    SetMetadata,
    UseGuards,
    applyDecorators,
    type Type,
} from '@nestjs/common';
import { Authenticated } from './decorators';
import { OwnerOrPermissionGuard } from './owner-or-permission.guard';
import {
    OWNER_OR_PERMISSION_KEY,
    type OwnerOrPermissionMetadata,
    type OwnerResolver,
} from './owner-or-permission.types';
import type { Permission } from './permissions';

/**
 * A verified user who holds `permission`, OR who owns the resource the
 * resolver names. Otherwise 403 PERMISSION_DENIED (identical whether the
 * resource is missing or foreign). Holding the permission never means "sees
 * everything": the service still runs its own access predicate.
 * Composes `@Authenticated()` so the global guards still authenticate first.
 */
export const RequireOwnerOrPermission = (
    permission: Permission,
    resolver: Type<OwnerResolver>
): MethodDecorator & ClassDecorator =>
    applyDecorators(
        Authenticated(),
        SetMetadata<string, OwnerOrPermissionMetadata>(
            OWNER_OR_PERMISSION_KEY,
            {
                permission,
                resolver,
            }
        ),
        UseGuards(OwnerOrPermissionGuard)
    );
