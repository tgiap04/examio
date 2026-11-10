/**
 * admin-service seed.
 *   - always: the 9 page feature flags (idempotent; keeps an admin's `enabled`
 *     choice and only re-syncs the label);
 *   - with `--dev`: sample admin-audit rows for the dev admin account (its id is
 *     derived from the email, never read from auth's database).
 *
 *   ADMIN_DATABASE_URL=postgresql://admin_svc:***@127.0.0.1:5432/examio?schema=admin \
 *     ts-node --transpile-only apps/admin-service/prisma/seed.ts [--dev]
 */
import { devSeedAdminEmail, devSeedUserId, seedDatabaseUrl } from '../../../libs/common/src/seed/dev-seed-users';
import { createPrismaAdapter } from '../src/prisma/create-prisma-adapter';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';

export const PAGE_FLAGS = [
    { key: 'ai-tool', label: 'Công cụ AI' },
    { key: 'word-family', label: 'Từ vựng tiếng Anh' },
    { key: 'my-materials', label: 'Tài liệu của tôi' },
    { key: 'my-exams', label: 'Bài thi của tôi' },
    { key: 'manage-exam', label: 'Quản lý Đề thi' },
    { key: 'flash-card', label: 'Quản lý Flashcard' },
    { key: 'manage-exam-room', label: 'Quản lý Phòng thi' },
    { key: 'history', label: 'Lịch sử' },
    { key: 'study-room', label: 'Phòng học chung' },
] as const;

export async function seedPageFlags(prisma: PrismaClient): Promise<number> {
    for (const flag of PAGE_FLAGS) {
        await prisma.pageFeatureFlag.upsert({
            where: { key: flag.key },
            update: { label: flag.label },
            create: { key: flag.key, label: flag.label, enabled: true },
        });
    }
    return PAGE_FLAGS.length;
}

const AUDIT_ACTIONS: Array<{ action: string; payload: Record<string, unknown> & { targetId?: string; userId?: string } }> = [
    { action: 'admin.finance.refund', payload: { paymentId: 'pay-refund-1', amount: 50000 } },
    { action: 'admin.finance.credit', payload: { userId: 'user-2', amount: 10000, reason: 'compensation' } },
    { action: 'admin.user.ban', payload: { targetId: 'banned-user', reason: 'spam' } },
    { action: 'admin.user.grant', payload: { targetId: 'new-admin', reason: 'trust' } },
    { action: 'admin.finance.tier', payload: { userId: 'user-3', tier: 2, reason: 'upgrade' } },
    { action: 'admin.user.update', payload: { targetId: 'user-1', fields: ['name'] } },
];

/** Deterministic ids + upsert: re-running the seed never adds rows. */
export async function seedAdminAudit(prisma: PrismaClient, adminId: string, count = 20): Promise<number> {
    for (let i = 0; i < count; i++) {
        const a = AUDIT_ACTIONS[i % AUDIT_ACTIONS.length];
        const createdAt = new Date();
        createdAt.setDate(createdAt.getDate() - (i % 14));
        const id = `seed-audit-${adminId}-${i}`;
        await prisma.adminAudit.upsert({
            where: { id },
            update: {},
            create: {
                id,
                adminId,
                action: a.action,
                targetId: a.payload.targetId ?? a.payload.userId ?? null,
                payload: a.payload as Prisma.InputJsonValue,
                reason: 'test seed',
                ipAddress: '127.0.0.1',
                userAgent: 'seed-script/1.0',
                createdAt,
            },
        });
    }
    return count;
}

async function main(): Promise<void> {
    const prisma = new PrismaClient({ adapter: createPrismaAdapter(seedDatabaseUrl('ADMIN')) });
    try {
        const flags = await seedPageFlags(prisma);
        console.log(`admin seed: ${flags} page feature flags`);
        if (process.argv.includes('--dev')) {
            const audits = await seedAdminAudit(prisma, devSeedUserId(devSeedAdminEmail()));
            console.log(`admin seed: ${audits} audit entries`);
        }
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error('admin seed failed:', err instanceof Error ? err.message : err);
        process.exit(1);
    });
}
