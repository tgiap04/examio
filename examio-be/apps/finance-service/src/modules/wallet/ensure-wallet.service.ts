import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { GenerateIdService } from '@examio/common';
import { PrismaService } from '@examio/database';

export const WELCOME_CREDITS = 20;
const INITIAL_CREDIT_TYPE = 1;

/**
 * Teacher provisioning, idempotent by construction. `Wallet.userId` and
 * `UserSubscription.userId` are unique, so `ON CONFLICT (userId) DO NOTHING`
 * makes redelivery, out-of-order events, concurrent callers and the lazy /
 * reconcile paths all safe. The +20 welcome transaction is written only when
 * THIS call inserted the wallet row (wallets are never deleted: once ever).
 */
@Injectable()
export class EnsureWalletService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly ids: GenerateIdService
    ) {}

    async ensure(
        userId: string,
        tx?: Prisma.TransactionClient
    ): Promise<{ created: boolean }> {
        if (!userId) throw new Error('ensureWallet requires a userId');
        if (tx) return this.run(tx, userId);
        return this.prisma.$transaction((inner) => this.run(inner, userId));
    }

    private async run(
        tx: Prisma.TransactionClient,
        userId: string
    ): Promise<{ created: boolean }> {
        const walletId = this.ids.generateId();
        const inserted = await tx.$queryRaw<Array<{ id: string }>>`
            INSERT INTO "Wallet" (id, "userId", balance, "createdBy", "createdAt", "updatedAt")
            VALUES (${walletId}, ${userId}, ${WELCOME_CREDITS}, 'ENSURE_WALLET', now(), now())
            ON CONFLICT ("userId") DO NOTHING
            RETURNING id`;

        const created = inserted.length > 0;
        if (created) {
            await tx.$executeRaw`
                INSERT INTO "WalletTransaction" (id, "walletId", amount, type, direction, description, "idempotencyKey", "balanceAfter", "createdBy")
                VALUES (${this.ids.generateId()}, ${inserted[0].id}, ${WELCOME_CREDITS}, ${INITIAL_CREDIT_TYPE}, 'ADD', 'Welcome bonus credits', ${`welcome:${userId}`}, ${WELCOME_CREDITS}, 'ENSURE_WALLET')`;
        }

        await tx.$executeRaw`
            INSERT INTO "UserSubscription" (id, "userId", tier, "billingCycle", "isActive", "createdAt", "updatedAt")
            VALUES (${this.ids.generateId()}, ${userId}, 0, 'monthly', false, now(), now())
            ON CONFLICT ("userId") DO NOTHING`;

        return { created };
    }
}
