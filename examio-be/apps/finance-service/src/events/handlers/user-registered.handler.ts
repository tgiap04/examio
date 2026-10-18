import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { GenerateIdService } from '@examio/common';
import { Envelope, EventHandler, PermanentEventError } from '@examio/messaging';

const WELCOME_CREDITS = 20;
const INITIAL_CREDIT_TYPE = 1;

/** Mirrors proto `examio.events.v1.UserRegistered`. */
const userRegisteredSchema = z.object({
    userId: z.string().min(1),
    email: z.string().optional(),
    username: z.string().optional(),
    utmSource: z.string().nullable().optional(),
});

/**
 * Bootstraps the wallet for a new user (20 welcome credits). Runs inside the
 * consumer's idempotency tx, so a redelivered event cannot credit twice; the
 * wallet-exists check also covers wallets created by any other path.
 * Phase 04 moves provisioning to `auth.user.authz_changed` (role=TEACHER).
 */
@Injectable()
export class UserRegisteredHandler {
    private readonly logger = new Logger(UserRegisteredHandler.name);

    constructor(private readonly generateIdService: GenerateIdService) {}

    @EventHandler('auth.user.registered')
    async handle(
        envelope: Envelope,
        tx: Prisma.TransactionClient
    ): Promise<void> {
        const parsed = userRegisteredSchema.safeParse(envelope.data);
        if (!parsed.success) {
            throw new PermanentEventError(
                'INVALID_DATA',
                'auth.user.registered requires data.userId'
            );
        }
        const { userId } = parsed.data;

        const existing = await tx.wallet.findUnique({ where: { userId } });
        if (existing) {
            this.logger.debug(`Wallet already exists for user ${userId}, skipping`);
            return;
        }

        const wallet = await tx.wallet.create({
            data: {
                id: this.generateIdService.generateId(),
                userId,
                balance: WELCOME_CREDITS,
                createdBy: 'EVENT_HANDLER',
            },
        });
        await tx.walletTransaction.create({
            data: {
                id: this.generateIdService.generateId(),
                walletId: wallet.id,
                amount: WELCOME_CREDITS,
                type: INITIAL_CREDIT_TYPE,
                direction: 'ADD',
                description: 'Welcome bonus credits',
                createdBy: 'EVENT_HANDLER',
            },
        });
        this.logger.log(`Created wallet ${wallet.id} for user ${userId} (event ${envelope.id})`);
    }
}
