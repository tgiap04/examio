/**
 * auth-service dev seed: the admin account and the dev accounts.
 *
 *   AUTH_DATABASE_URL=postgresql://auth_svc:***@127.0.0.1:5432/examio?schema=auth \
 *     ts-node --transpile-only apps/auth-service/prisma/seed.ts --dev
 *
 * Without `--dev` there is no reference data to seed in auth, so it is a no-op.
 * The URL is never printed. The ADMIN bootstrap for real environments stays the
 * auth CLI (`yarn bootstrap:admin`).
 */
import * as bcrypt from 'bcryptjs';
import { DEV_SEED_USERS, devSeedAdminEmail, devSeedUserId, seedDatabaseUrl } from '../../../libs/common/src/seed/dev-seed-users';
import { createPrismaAdapter } from '../src/prisma/create-prisma-adapter';
import { PrismaClient } from '../src/generated/prisma/client';

function daysAgo(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
}

/**
 * Shared dev password, hashed at runtime (same lib and salt rounds as
 * `PasswordService`): SEED_PASSWORD, else ADMIN_DEFAULT_PASSWORD, else 'password123'.
 */
const devPassword = () => process.env.SEED_PASSWORD ?? process.env.ADMIN_DEFAULT_PASSWORD ?? 'password123';

export async function seedDevUsers(prisma: PrismaClient): Promise<{ adminId: string; userIds: string[] }> {
    const hash = await bcrypt.hash(devPassword(), 10);
    const adminEmail = devSeedAdminEmail();
    const adminId = devSeedUserId(adminEmail);

    await prisma.user.upsert({
        where: { email: adminEmail },
        update: { isSystemAdmin: true, isVerified: true, isBanned: false, deletedAt: null, password: hash },
        create: {
            id: adminId,
            email: adminEmail,
            username: 'admin',
            name: 'Admin User',
            avatar: '',
            // SYSTEM_ADMIN is the `isSystemAdmin` flag (base role stays STUDENT).
            isSystemAdmin: true,
            isVerified: true,
            isBanned: false,
            password: hash,
            createdAt: daysAgo(90),
        },
    });

    const userIds: string[] = [];
    for (const u of DEV_SEED_USERS) {
        const id = devSeedUserId(u.email);
        await prisma.user.upsert({
            where: { email: u.email },
            // Dev users are TEACHERs so they can author content out of the box.
            update: { role: 'TEACHER', isBanned: u.isBanned ?? false, isVerified: true, deletedAt: null, password: hash },
            create: {
                id,
                email: u.email,
                username: u.username,
                name: u.name,
                avatar: '',
                role: 'TEACHER',
                isSystemAdmin: false,
                isVerified: true,
                isBanned: u.isBanned ?? false,
                password: hash,
                createdAt: daysAgo((id.charCodeAt(0) % 60) + 1),
            },
        });
        userIds.push(id);
    }
    return { adminId, userIds };
}

async function main(): Promise<void> {
    if (!process.argv.includes('--dev')) {
        console.log('auth seed: nothing to seed without --dev');
        return;
    }
    const prisma = new PrismaClient({ adapter: createPrismaAdapter(seedDatabaseUrl('AUTH')) });
    try {
        const { userIds } = await seedDevUsers(prisma);
        console.log(`auth seed: admin + ${userIds.length} dev users`);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error('auth seed failed:', err instanceof Error ? err.message : err);
        process.exit(1);
    });
}
