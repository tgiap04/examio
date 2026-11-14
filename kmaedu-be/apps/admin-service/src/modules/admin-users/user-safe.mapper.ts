import { authV1 } from '@kmaedu/contracts';
import { UserSafeRow } from './user-select.safe';

const date = (epochMs: string): Date => new Date(Number(epochMs));

/**
 * `authV1.User` -> the row shape the admin API has always returned (never a
 * password). `deletedAt` stays in the shape for API compatibility but is always
 * null: the auth `User` message carries no such field (auth serves live accounts
 * only, and unbanning a legacy soft-deleted account clears it).
 */
export function toUserSafeRow(u: authV1.User): UserSafeRow {
    return {
        id: u.id,
        email: u.email,
        username: u.username,
        name: u.name || null,
        bio: u.bio ?? null,
        avatar: u.avatar || null,
        banner: u.banner ?? null,
        role: u.role === authV1.BaseRole.BASE_ROLE_TEACHER ? 'TEACHER' : 'STUDENT',
        isSystemAdmin: u.isSystemAdmin,
        isVerified: u.isVerified,
        isBanned: u.isBanned,
        deletedAt: null,
        createdAt: date(u.createdAt),
        updatedAt: date(u.updatedAt),
        createdBy: u.createdBy ?? null,
        updatedBy: u.updatedBy ?? null,
    };
}
