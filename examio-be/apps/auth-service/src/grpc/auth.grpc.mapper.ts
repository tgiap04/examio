import type { BaseRole, Prisma } from '@prisma/client';
import { authV1 } from '@examio/contracts';

export const USER_SELECT = {
    id: true,
    email: true,
    username: true,
    name: true,
    avatar: true,
    role: true,
    isSystemAdmin: true,
    isVerified: true,
    isBanned: true,
    createdAt: true,
    updatedAt: true,
    utmSource: true,
    bio: true,
    banner: true,
    createdBy: true,
    updatedBy: true,
} satisfies Prisma.UserSelect;

export const PUBLIC_PROFILE_SELECT = {
    id: true,
    username: true,
    name: true,
    avatar: true,
} satisfies Prisma.UserSelect;

export type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;
export type PublicProfileRow = Prisma.UserGetPayload<{
    select: typeof PUBLIC_PROFILE_SELECT;
}>;

export function toProtoRole(role: BaseRole | string): authV1.BaseRole {
    return role === 'TEACHER'
        ? authV1.BaseRole.BASE_ROLE_TEACHER
        : authV1.BaseRole.BASE_ROLE_STUDENT;
}

/** undefined for UNSPECIFIED / unknown (callers decide whether that is an error). */
export function fromProtoRole(role: authV1.BaseRole): BaseRole | undefined {
    if (role === authV1.BaseRole.BASE_ROLE_TEACHER) return 'TEACHER';
    if (role === authV1.BaseRole.BASE_ROLE_STUDENT) return 'STUDENT';
    return undefined;
}

export function toUser(row: UserRow): authV1.User {
    return {
        id: row.id,
        email: row.email,
        username: row.username,
        name: row.name ?? '',
        avatar: row.avatar ?? '',
        role: toProtoRole(row.role),
        isSystemAdmin: row.isSystemAdmin,
        isVerified: row.isVerified,
        isBanned: row.isBanned,
        createdAt: String(row.createdAt.getTime()),
        updatedAt: String(row.updatedAt.getTime()),
        utmSource: row.utmSource ?? undefined,
        bio: row.bio ?? undefined,
        banner: row.banner ?? undefined,
        createdBy: row.createdBy ?? undefined,
        updatedBy: row.updatedBy ?? undefined,
    };
}

/** No `email` key, ever: this is the only projection that may be cached or shown. */
export function toPublicProfile(row: PublicProfileRow): authV1.PublicProfile {
    return {
        id: row.id,
        username: row.username,
        name: row.name ?? '',
        avatar: row.avatar ?? '',
    };
}
