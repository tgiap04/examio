import { createHash } from 'crypto';

/**
 * Dev-only fixture shared by the per-service dev seeds (auth, admin).
 * No service may read another service's database, so the admin seed derives
 * the very same user ids from the email instead of querying auth.
 */
export interface DevSeedUser {
    email: string;
    username: string;
    name: string;
    isBanned?: boolean;
}

export const DEV_SEED_USERS: readonly DevSeedUser[] = [
    { email: 'user1@kmaedu.fayedark.com', username: 'user1', name: 'Nguyễn Văn A' },
    { email: 'user2@kmaedu.fayedark.com', username: 'user2', name: 'Trần Thị B' },
    { email: 'user3@kmaedu.fayedark.com', username: 'user3', name: 'Lê Văn C' },
    { email: 'user4@kmaedu.fayedark.com', username: 'user4', name: 'Phạm Thị D' },
    { email: 'user5@kmaedu.fayedark.com', username: 'user5', name: 'Hoàng Văn E' },
    { email: 'user6@kmaedu.fayedark.com', username: 'user6', name: 'Đặng Thị F' },
    { email: 'banned@kmaedu.fayedark.com', username: 'banned', name: 'User Banned', isBanned: true },
];

/** Stable 24-hex id of a dev account (same in every service's seed). */
export function devSeedUserId(email: string): string {
    return createHash('sha256').update(`kmaedu-dev-seed:${email.toLowerCase()}`).digest('hex').slice(0, 24);
}

/** The dev admin account: first `ADMIN_EMAILS` entry, else admin@kmaedu.fayedark.com. */
export function devSeedAdminEmail(adminEmails: string | undefined = process.env.ADMIN_EMAILS): string {
    return adminEmails?.split(',')[0]?.trim() || 'admin@kmaedu.fayedark.com';
}

/** Per-service seed database URL: `<SVC>_DATABASE_URL`, falling back to `DATABASE_URL`. */
export function seedDatabaseUrl(service: 'AUTH' | 'ADMIN', env: NodeJS.ProcessEnv = process.env): string {
    const url = env[`${service}_DATABASE_URL`] ?? env.DATABASE_URL;
    if (!url) {
        throw new Error(`${service}_DATABASE_URL (or DATABASE_URL) is required to seed ${service.toLowerCase()}-service`);
    }
    return url;
}
