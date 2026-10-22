import type { Prisma } from '@prisma/client';

/**
 * Type-only description of the admin user row: an explicit allowlist that
 * NEVER includes `password`. Rows are built by `toUserSafeRow` from auth's
 * `User` message (admin no longer reads the `User` table), so this select is
 * only used to derive `UserSafeRow`.
 */
export const userSelectSafe = {
    id: true,
    email: true,
    username: true,
    name: true,
    bio: true,
    avatar: true,
    banner: true,
    role: true,
    isSystemAdmin: true,
    isVerified: true,
    isBanned: true,
    deletedAt: true,
    createdAt: true,
    updatedAt: true,
    createdBy: true,
    updatedBy: true,
} satisfies Prisma.UserSelect;

export type UserSafeRow = Prisma.UserGetPayload<{ select: typeof userSelectSafe }>;
