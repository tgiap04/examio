import { Prisma } from '@prisma/client';

/**
 * Safe Prisma select for `User` — explicit allowlist that NEVER
 * includes the `password` field. Every admin endpoint that returns a
 * user must spread this select (or build on top of it) to guarantee
 * no password hash ever leaks to the response.
 *
 * Keep this in sync with the `User` model in
 * `libs/database/src/schema.prisma`. If a new column is added and
 * is not sensitive, prefer extending the allowlist explicitly.
 */
export const userSelectSafe = {
    id: true,
    email: true,
    username: true,
    name: true,
    bio: true,
    avatar: true,
    banner: true,
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
