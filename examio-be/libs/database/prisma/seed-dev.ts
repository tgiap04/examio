import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';

// Load .env from the first location that exists so the seed script works
// the same way as the Nest services regardless of where it is invoked:
//   1. ./deploy/.env   (when running inside deploy/, e.g. `cd deploy && yarn seed`)
//   2. ../.env         (project root, the default Nest CLI target)
// Already-set env vars (e.g. CI, `SEED_PASSWORD=...`) are NOT overridden.
const cwdEnv = join(process.cwd(), '.env');
const rootEnv = join(process.cwd(), '..', '.env');
if (existsSync(cwdEnv)) {
    loadEnv({ path: cwdEnv });
} else if (existsSync(rootEnv)) {
    loadEnv({ path: rootEnv });
}

const prisma = new PrismaClient();

function uid(): string {
    return randomBytes(12).toString('hex');
}

function daysAgo(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
}

function daysLater(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
}

/**
 * Shared dev password. Hashed at runtime so the source never has to ship a
 * pre-computed bcrypt hash, and to stay in sync with `PasswordService`
 * (same lib, same salt rounds).
 *
 * Resolution order:
 *   1. SEED_PASSWORD (per-run override, e.g. CI)
 *   2. ADMIN_DEFAULT_PASSWORD (env-defined default, used by auth-service
 *      for bootstrapping admin accounts — see
 *      auth-service/src/admin-bootstrap/admin-bootstrap.service.ts)
 *   3. 'password123' (last-resort dev default)
 */
const DEV_PASSWORD =
    process.env.SEED_PASSWORD ??
    process.env.ADMIN_DEFAULT_PASSWORD ??
    'password123';

async function devPasswordHash(): Promise<string> {
    return bcrypt.hash(DEV_PASSWORD, 10);
}

async function seedUsers() {
    console.log('\n👥 Seeding users...');

    const adminEmail = process.env.ADMIN_EMAILS?.split(',')[0].trim() || 'admin@examio.vn';

    const adminPasswordHash = await devPasswordHash();
    const admin = await prisma.user.upsert({
        where: { email: adminEmail },
        update: {
            isSystemAdmin: true,
            isVerified: true,
            isBanned: false,
            deletedAt: null,
            password: adminPasswordHash,
        },
        create: {
            id: uid(),
            email: adminEmail,
            username: 'admin',
            name: 'Admin User',
            avatar: '',
            // SYSTEM_ADMIN is the `isSystemAdmin` flag (base role stays STUDENT).
            isSystemAdmin: true,
            isVerified: true,
            isBanned: false,
            password: adminPasswordHash,
            createdAt: daysAgo(90),
        },
    });
    console.log(`   ✅ Admin: ${admin.email}`);

    const testUsers = [
        { email: 'user1@examio.vn', username: 'user1', name: 'Nguyễn Văn A', balance: 150000 },
        { email: 'user2@examio.vn', username: 'user2', name: 'Trần Thị B', balance: 0 },
        { email: 'user3@examio.vn', username: 'user3', name: 'Lê Văn C', balance: 50000 },
        { email: 'user4@examio.vn', username: 'user4', name: 'Phạm Thị D', balance: 200000 },
        { email: 'user5@examio.vn', username: 'user5', name: 'Hoàng Văn E', balance: 75000 },
        { email: 'user6@examio.vn', username: 'user6', name: 'Đặng Thị F', balance: 300000 },
        { email: 'banned@examio.vn', username: 'banned', name: 'User Banned', balance: 10000, isBanned: true },
    ];

    const createdUsers = [];
    for (const u of testUsers) {
        const userPasswordHash = await devPasswordHash();
        const user = await prisma.user.upsert({
            where: { email: u.email },
            update: {
                // Dev users own a wallet, so they are TEACHERs (wallets are teacher-only).
                role: 'TEACHER',
                isBanned: u.isBanned ?? false,
                isVerified: true,
                deletedAt: null,
                password: userPasswordHash,
            },
            create: {
                id: uid(),
                email: u.email,
                username: u.username,
                name: u.name,
                avatar: '',
                role: 'TEACHER',
                isSystemAdmin: false,
                isVerified: true,
                isBanned: u.isBanned ?? false,
                password: userPasswordHash,
                createdAt: daysAgo(Math.floor(Math.random() * 60) + 1),
            },
        });
        createdUsers.push({ id: user.id, email: user.email, balance: u.balance });
        console.log(`   ${u.isBanned ? '🚫' : '✅'} ${u.email} (balance: ${u.balance})`);
    }

    return { admin, users: createdUsers };
}

async function seedWallets(users: { id: string; email: string; balance: number }[]) {
    console.log('\n💰 Seeding wallets...');

    for (const user of users) {
        const wallet = await prisma.wallet.upsert({
            where: { userId: user.id },
            update: { balance: user.balance },
            create: {
                id: uid(),
                userId: user.id,
                balance: user.balance,
                createdBy: user.id,
            },
        });
        console.log(`   ✅ wallet ${user.email}: ${user.balance}`);
    }
}

async function seedPayments(users: { id: string; email: string }[]) {
    console.log('\n💳 Seeding payments...');

    const paymentTypes = ['credits', 'subscription'];
    const statuses = [
        { status: 1, label: 'paid' },       // credits
        { status: 1, label: 'paid' },       // credits
        { status: 1, label: 'paid' },       // credits
        { status: 1, label: 'paid' },       // subscription
        { status: 1, label: 'paid' },       // subscription
        { status: 0, label: 'unpaid' },     // credits
        { status: 0, label: 'unpaid' },     // credits
        { status: 2, label: 'overdue' },    // credits
        { status: 4, label: 'refunded' },   // credits
        { status: 4, label: 'refunded' },   // credits
        { status: 3, label: 'cancelled' },  // credits
    ];

    const amounts = [10000, 20000, 30000, 50000, 100000, 150000, 200000, 300000, 500000];

    for (const user of users.slice(0, 6)) {
        // 2-4 payments per user
        const count = Math.floor(Math.random() * 3) + 2;
        for (let i = 0; i < count; i++) {
            const s = statuses[Math.floor(Math.random() * statuses.length)];
            const amount = amounts[Math.floor(Math.random() * amounts.length)];
            const paymentType = paymentTypes[Math.floor(Math.random() * paymentTypes.length)];

            const payment = await prisma.payment.create({
                data: {
                    id: uid(),
                    userId: user.id,
                    amount,
                    currency: 'VND',
                    status: s.status,
                    paymentType,
                    orderId: `ORD-${randomBytes(6).toString('hex').toUpperCase()}`,
                    createdAt: daysAgo(Math.floor(Math.random() * 30)),
                    expiresAt: s.status === 0 ? daysLater(1) : null,
                },
            });
            console.log(`   ✅ payment ${payment.id} (${s.label}): ${amount} VND for ${user.email}`);
        }
    }
}

async function seedWalletTransactions(users: { id: string; email: string }[]) {
    console.log('\n📜 Seeding wallet transactions...');

    const txTypes = [
        { type: 0, direction: 'ADD', description: 'Buy credits package' },
        { type: 1, direction: 'ADD', description: 'Buy subscription' },
        { type: 2, direction: 'SUBTRACT', description: 'Refund' },
        { type: 4, direction: 'SUBTRACT', description: 'Use AI generation' },
        { type: 4, direction: 'SUBTRACT', description: 'Use AI tool' },
    ];

    for (const user of users.slice(0, 5)) {
        const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
        if (!wallet) continue;

        const count = Math.floor(Math.random() * 5) + 3;
        for (let i = 0; i < count; i++) {
            const t = txTypes[Math.floor(Math.random() * txTypes.length)];
            const amount = [1000, 2000, 5000, 10000, 20000, 50000][Math.floor(Math.random() * 6)];

            await prisma.walletTransaction.create({
                data: {
                    id: uid(),
                    walletId: wallet.id,
                    amount,
                    type: t.type,
                    direction: t.direction,
                    description: t.description,
                    createdAt: daysAgo(Math.floor(Math.random() * 20)),
                },
            });
        }
        console.log(`   ✅ ${count} transactions for ${user.email}`);
    }
}

async function seedAdminAudit(adminId: string) {
    console.log('\n📋 Seeding admin audit entries...');

    const actions = [
        { action: 'admin.finance.refund', payload: { paymentId: 'pay-refund-1', amount: 50000 } },
        { action: 'admin.finance.credit', payload: { userId: 'user-2', amount: 10000, reason: 'compensation' } },
        { action: 'admin.user.ban', payload: { targetId: 'banned-user', reason: 'spam' } },
        { action: 'admin.user.grant', payload: { targetId: 'new-admin', reason: 'trust' } },
        { action: 'admin.finance.tier', payload: { userId: 'user-3', tier: 2, reason: 'upgrade' } },
        { action: 'admin.user.update', payload: { targetId: 'user-1', fields: ['name'] } },
    ];

    for (let i = 0; i < 20; i++) {
        const a = actions[Math.floor(Math.random() * actions.length)];
        await prisma.adminAudit.create({
            data: {
                id: uid(),
                adminId,
                action: a.action,
                targetId: a.payload.targetId ?? a.payload.userId ?? null,
                payload: a.payload as any,
                reason: 'test seed',
                ipAddress: '127.0.0.1',
                userAgent: 'seed-script/1.0',
                createdAt: daysAgo(Math.floor(Math.random() * 14)),
            },
        });
    }
    console.log(`   ✅ 20 audit entries created`);
}

async function seedPageFlags() {
    const pageFlags = [
        { key: 'ai-tool', label: 'Công cụ AI' },
        { key: 'word-family', label: 'Từ vựng tiếng Anh' },
        { key: 'my-materials', label: 'Tài liệu của tôi' },
        { key: 'my-exams', label: 'Bài thi của tôi' },
        { key: 'manage-exam', label: 'Quản lý Đề thi' },
        { key: 'flash-card', label: 'Quản lý Flashcard' },
        { key: 'manage-exam-room', label: 'Quản lý Phòng thi' },
        { key: 'history', label: 'Lịch sử' },
        { key: 'study-room', label: 'Phòng học chung' },
    ];
    for (const flag of pageFlags) {
        await prisma.pageFeatureFlag.upsert({
            where: { key: flag.key },
            update: { label: flag.label },
            create: { key: flag.key, label: flag.label, enabled: true },
        });
    }
    console.log(`✅ Seeded ${pageFlags.length} page feature flags`);
}

async function main() {
    console.log('🌱 Seed script starting...');
    console.log('   Database URL:', process.env.DATABASE_URL ? '<set>' : '(not set — using default)');

    try {
        // PageFeatureFlag may not exist on an older schema. Probe before writing.
        const pageFlagExists = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'PageFeatureFlag') AS exists",
        );
        if (pageFlagExists[0]?.exists) {
            await seedPageFlags();
        } else {
            console.log('\n⚠️  table PageFeatureFlag missing — skipping page flags seed');
        }

        const { admin, users } = await seedUsers();
        // Wallets are teacher-only: the SYSTEM_ADMIN account gets none.
        await seedWallets(users);

        const allUsers = await prisma.$queryRawUnsafe<{ id: string; email: string }[]>(
            'SELECT id, email FROM "User"',
        );

        await seedPayments(allUsers);
        await seedWalletTransactions(allUsers);

        // AdminAudit may not exist on an older schema. Probe before writing.
        const auditExists = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'AdminAudit') AS exists",
        );
        if (auditExists[0]?.exists) {
            await seedAdminAudit(admin.id);
        } else {
            console.log('\n⚠️  table AdminAudit missing — skipping admin audit seed');
        }

        console.log('\n✅ Seed completed successfully!');
        console.log('   Admin login:', process.env.ADMIN_EMAILS?.split(',')[0] ?? 'admin@examio.vn');
    } catch (err) {
        console.error('❌ Seed failed:', err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();