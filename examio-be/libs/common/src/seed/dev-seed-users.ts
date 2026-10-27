import { createHash } from 'crypto';

/**
 * Dev-only fixture shared by the per-service dev seeds (auth, finance, admin).
 * No service may read another service's database, so the finance and admin
 * seeds derive the very same user ids from the email instead of querying auth.
 */
export interface DevSeedUser {
    email: string;
    username: string;
    name: string;
    balance: number;
    isBanned?: boolean;
}

export const DEV_SEED_USERS: readonly DevSeedUser[] = [
    { email: 'user1@examio.vn', username: 'user1', name: 'Nguyễn Văn A', balance: 150000 },
    { email: 'user2@examio.vn', username: 'user2', name: 'Trần Thị B', balance: 0 },
    { email: 'user3@examio.vn', username: 'user3', name: 'Lê Văn C', balance: 50000 },
    { email: 'user4@examio.vn', username: 'user4', name: 'Phạm Thị D', balance: 200000 },
    { email: 'user5@examio.vn', username: 'user5', name: 'Hoàng Văn E', balance: 75000 },
    { email: 'user6@examio.vn', username: 'user6', name: 'Đặng Thị F', balance: 300000 },
    { email: 'banned@examio.vn', username: 'banned', name: 'User Banned', balance: 10000, isBanned: true },
];

/** Stable 24-hex id of a dev account (same in every service's seed). */
export function devSeedUserId(email: string): string {
    return createHash('sha256').update(`examio-dev-seed:${email.toLowerCase()}`).digest('hex').slice(0, 24);
}

/** The dev admin account: first `ADMIN_EMAILS` entry, else admin@examio.vn. */
export function devSeedAdminEmail(adminEmails: string | undefined = process.env.ADMIN_EMAILS): string {
    return adminEmails?.split(',')[0]?.trim() || 'admin@examio.vn';
}

/** Per-service seed database URL: `<SVC>_DATABASE_URL`, falling back to `DATABASE_URL`. */
export function seedDatabaseUrl(service: 'AUTH' | 'FINANCE' | 'ADMIN', env: NodeJS.ProcessEnv = process.env): string {
    const url = env[`${service}_DATABASE_URL`] ?? env.DATABASE_URL;
    if (!url) {
        throw new Error(`${service}_DATABASE_URL (or DATABASE_URL) is required to seed ${service.toLowerCase()}-service`);
    }
    return url;
}
