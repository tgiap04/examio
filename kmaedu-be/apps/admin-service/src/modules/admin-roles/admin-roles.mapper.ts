import { authV1 } from '@kmaedu/contracts';
import { PERMISSIONS, ROLE_PERMISSIONS } from '@kmaedu/auth-jwt';

export type BaseRoleName = 'STUDENT' | 'TEACHER';

export interface RoleUserItem {
    id: string;
    email: string;
    username: string;
    name: string;
    avatar: string | null;
    role: BaseRoleName;
    isSystemAdmin: boolean;
    isBanned: boolean;
    isVerified: boolean;
    createdAt: string;
}

export interface RoleChangeItem {
    id: string;
    targetUserId: string;
    targetEmail: string;
    actorUserId: string | null;
    actorEmail: string;
    fromRole: BaseRoleName;
    toRole: BaseRoleName;
    fromAdmin: boolean;
    toAdmin: boolean;
    reason: string | null;
    source: string;
    createdAt: string;
}

export const toProtoRole = (role: BaseRoleName): authV1.BaseRole =>
    role === 'TEACHER' ? authV1.BaseRole.BASE_ROLE_TEACHER : authV1.BaseRole.BASE_ROLE_STUDENT;

export const fromProtoRole = (role: authV1.BaseRole): BaseRoleName =>
    role === authV1.BaseRole.BASE_ROLE_TEACHER ? 'TEACHER' : 'STUDENT';

const iso = (epochMs: string): string => new Date(Number(epochMs)).toISOString();

export function toRoleUserItem(u: authV1.User): RoleUserItem {
    return {
        id: u.id,
        email: u.email,
        username: u.username,
        name: u.name,
        avatar: u.avatar || null,
        role: fromProtoRole(u.role),
        isSystemAdmin: u.isSystemAdmin,
        isBanned: u.isBanned,
        isVerified: u.isVerified,
        createdAt: iso(u.createdAt),
    };
}

export function toRoleChangeItem(c: authV1.RoleChange): RoleChangeItem {
    return {
        id: c.id,
        targetUserId: c.targetUserId,
        targetEmail: c.targetEmail,
        // Auth puts the actor's user id in `changedBy` for UI changes and the
        // actor's email for CLI/bootstrap (no user row).
        actorUserId: c.source === 'admin-ui' ? c.changedBy : null,
        actorEmail: c.actorEmail,
        fromRole: fromProtoRole(c.fromRole),
        toRole: fromProtoRole(c.toRole),
        fromAdmin: c.fromIsSystemAdmin,
        toAdmin: c.toIsSystemAdmin,
        reason: c.reason || null,
        source: c.source,
        createdAt: iso(c.createdAt),
    };
}

/** Read-only role -> permission catalog, straight from the code. */
export function permissionMatrix() {
    return {
        roles: (['STUDENT', 'TEACHER', 'SYSTEM_ADMIN'] as const).map((key) => ({
            key,
            permissions: [...ROLE_PERMISSIONS[key]],
        })),
        permissions: Object.values(PERMISSIONS),
    };
}
