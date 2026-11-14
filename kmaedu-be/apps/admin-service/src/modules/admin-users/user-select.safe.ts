/**
 * The admin user row: an explicit allowlist that NEVER includes `password`.
 * Rows are built by `toUserSafeRow` from auth's `User` message (admin has no
 * `User` table), so this is a plain shape, not a Prisma payload.
 */
export interface UserSafeRow {
    id: string;
    email: string;
    username: string;
    name: string | null;
    bio: string | null;
    avatar: string | null;
    banner: string | null;
    role: 'STUDENT' | 'TEACHER';
    isSystemAdmin: boolean;
    isVerified: boolean;
    isBanned: boolean;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string | null;
    updatedBy: string | null;
}

/** Explicit allowlist of the row's fields (never `password`); keeps the shape and the list in lockstep. */
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
} satisfies Record<keyof UserSafeRow, true>;
