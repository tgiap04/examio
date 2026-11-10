import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { EventHandler, PermanentEventError, type Envelope } from '@examio/messaging';
import { AuthStateService } from '../pipeline/auth-state.service';

export const AUTHZ_CHANGED = 'auth.user.authz_changed';

const payload = z.object({
    userId: z.string().min(1),
    authzVersion: z.number().int().nonnegative(),
});

/**
 * Durable twin of `GatewayControl.InvalidateUser` (RT-3): a lost gRPC call can
 * not leave a demoted or banned user active beyond one event delivery. SETMAX is
 * idempotent and order-safe, so no processed-events table (and no DB) is needed.
 * A Redis failure throws and rides the consumer's retry / dead-letter path.
 */
@Injectable()
export class AuthzChangedHandler {
    constructor(private readonly state: AuthStateService) {}

    @EventHandler(AUTHZ_CHANGED, { dedupe: false })
    async onAuthzChanged(envelope: Envelope): Promise<void> {
        const parsed = payload.safeParse(envelope.data);
        if (!parsed.success) {
            throw new PermanentEventError('INVALID_PAYLOAD', `${AUTHZ_CHANGED} payload is malformed`);
        }
        await this.state.raiseAuthzVersion(parsed.data.userId, parsed.data.authzVersion);
    }
}
