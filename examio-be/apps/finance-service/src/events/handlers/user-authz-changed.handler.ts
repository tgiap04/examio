import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Envelope, EventHandler, PermanentEventError } from '@examio/messaging';
import { EnsureWalletService } from '../../modules/wallet/ensure-wallet.service';

/** Mirrors proto `examio.events.v1.UserAuthzChanged`. */
const schema = z.object({
    userId: z.string().min(1),
    authzVersion: z.number().int().optional(),
    role: z.enum(['STUDENT', 'TEACHER']),
    isSystemAdmin: z.boolean().optional(),
    isBanned: z.boolean().optional(),
    reason: z.string().optional(),
    version: z.number().int().optional(),
});

/**
 * Provisions a wallet (+20 once) and a Free subscription for TEACHERs. Any
 * `reason` counts (a forced `reapply` is the support recovery path). Demotion
 * is a no-op: the wallet is kept, just unreachable without `wallet:use`.
 */
@Injectable()
export class UserAuthzChangedHandler {
    private readonly logger = new Logger(UserAuthzChangedHandler.name);

    constructor(private readonly wallets: EnsureWalletService) {}

    @EventHandler('auth.user.authz_changed')
    async handle(envelope: Envelope, tx: Prisma.TransactionClient): Promise<void> {
        const parsed = schema.safeParse(envelope.data);
        if (!parsed.success) {
            throw new PermanentEventError(
                'INVALID_DATA',
                'auth.user.authz_changed requires userId and a valid role'
            );
        }
        const { userId, role } = parsed.data;
        if (role !== 'TEACHER') return;

        const { created } = await this.wallets.ensure(userId, tx);
        this.logger.log(
            `ensureWallet(${userId}) ${created ? 'created' : 'already present'} (event ${envelope.id})`
        );
    }
}
