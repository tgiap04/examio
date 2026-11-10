/**
 * finance-service dev seed: wallets, payments and wallet transactions of the dev
 * accounts. The accounts live in auth; their ids are derived from the email
 * (libs/common/src/seed/dev-seed-users.ts), never read from auth's database.
 *
 *   FINANCE_DATABASE_URL=postgresql://finance_svc:***@127.0.0.1:5432/examio?schema=finance \
 *     ts-node --transpile-only apps/finance-service/prisma/seed.ts --dev
 */
import { randomBytes } from 'crypto';
import { DEV_SEED_USERS, devSeedUserId, seedDatabaseUrl } from '../../../libs/common/src/seed/dev-seed-users';
import { createPrismaAdapter } from '../src/prisma/create-prisma-adapter';
import { PrismaClient } from '../src/generated/prisma/client';

const uid = (): string => randomBytes(12).toString('hex');
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

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

const devUsers = DEV_SEED_USERS.map((u) => ({ ...u, id: devSeedUserId(u.email) }));

/** Wallets are teacher-only: the SYSTEM_ADMIN account gets none. */
export async function seedWallets(prisma: PrismaClient): Promise<number> {
    for (const user of devUsers) {
        await prisma.wallet.upsert({
            where: { userId: user.id },
            update: { balance: user.balance },
            create: { id: uid(), userId: user.id, balance: user.balance, createdBy: user.id },
        });
    }
    return devUsers.length;
}

export async function seedPayments(prisma: PrismaClient): Promise<number> {
    const paymentTypes = ['credits', 'subscription'];
    const statuses = [1, 1, 1, 1, 1, 0, 0, 2, 4, 4, 3]; // paid x5, unpaid x2, overdue, refunded x2, cancelled
    const amounts = [10000, 20000, 30000, 50000, 100000, 150000, 200000, 300000, 500000];
    let created = 0;
    for (const user of devUsers.slice(0, 6)) {
        const count = Math.floor(Math.random() * 3) + 2; // 2-4 payments per user
        for (let i = 0; i < count; i++) {
            const status = pick(statuses);
            await prisma.payment.create({
                data: {
                    id: uid(),
                    userId: user.id,
                    amount: pick(amounts),
                    currency: 'VND',
                    status,
                    paymentType: pick(paymentTypes),
                    orderId: `ORD-${randomBytes(6).toString('hex').toUpperCase()}`,
                    createdAt: daysAgo(Math.floor(Math.random() * 30)),
                    expiresAt: status === 0 ? daysLater(1) : null,
                },
            });
            created++;
        }
    }
    return created;
}

export async function seedWalletTransactions(prisma: PrismaClient): Promise<number> {
    const txTypes = [
        { type: 0, direction: 'ADD', description: 'Buy credits package' },
        { type: 1, direction: 'ADD', description: 'Buy subscription' },
        { type: 2, direction: 'SUBTRACT', description: 'Refund' },
        { type: 4, direction: 'SUBTRACT', description: 'Use AI generation' },
        { type: 4, direction: 'SUBTRACT', description: 'Use AI tool' },
    ];
    const amounts = [1000, 2000, 5000, 10000, 20000, 50000];
    let created = 0;
    for (const user of devUsers.slice(0, 5)) {
        const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
        if (!wallet) continue;
        const count = Math.floor(Math.random() * 5) + 3;
        for (let i = 0; i < count; i++) {
            const t = pick(txTypes);
            await prisma.walletTransaction.create({
                data: {
                    id: uid(),
                    walletId: wallet.id,
                    amount: pick(amounts),
                    type: t.type,
                    direction: t.direction,
                    description: t.description,
                    createdAt: daysAgo(Math.floor(Math.random() * 20)),
                },
            });
            created++;
        }
    }
    return created;
}

async function main(): Promise<void> {
    if (!process.argv.includes('--dev')) {
        console.log('finance seed: nothing to seed without --dev');
        return;
    }
    const prisma = new PrismaClient({ adapter: createPrismaAdapter(seedDatabaseUrl('FINANCE')) });
    try {
        const wallets = await seedWallets(prisma);
        const payments = await seedPayments(prisma);
        const transactions = await seedWalletTransactions(prisma);
        console.log(`finance seed: ${wallets} wallets, ${payments} payments, ${transactions} wallet transactions`);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error('finance seed failed:', err instanceof Error ? err.message : err);
        process.exit(1);
    });
}
