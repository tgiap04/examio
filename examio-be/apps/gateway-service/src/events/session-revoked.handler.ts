import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { EventHandler, PermanentEventError, type Envelope } from '@examio/messaging';
import { AuthStateService } from '../pipeline/auth-state.service';

export const SESSION_REVOKED = 'auth.session.revoked';

/** The publisher writes int64 as strings (ts-proto); accept either form. */
const seconds = z.coerce.number().int().nonnegative();
const payload = z.object({
    userId: z.string().min(1),
    sid: z.string().min(1),
    exp: z.union([z.number(), z.string().regex(/^\d+$/)]).pipe(seconds),
    version: z.union([z.number(), z.string().regex(/^\d+$/)]).pipe(seconds),
});

/**
 * Durable twin of `GatewayControl.RevokeSession`: sets `gw:revoked:sid:<sid>`
 * with TTL `exp - now`, or does nothing if `exp` has passed (the token is dead
 * anyway). Idempotent per sid, so no processed-events table (no DB) is needed.
 * A Redis failure throws and rides the consumer's retry / dead-letter path.
 */
@Injectable()
export class SessionRevokedHandler {
    constructor(private readonly state: AuthStateService) {}

    @EventHandler(SESSION_REVOKED, { dedupe: false })
    async onSessionRevoked(envelope: Envelope): Promise<void> {
        const parsed = payload.safeParse(envelope.data);
        if (!parsed.success) {
            throw new PermanentEventError('INVALID_PAYLOAD', `${SESSION_REVOKED} payload is malformed`);
        }
        const { sid, exp } = parsed.data;
        if (exp <= Math.floor(Date.now() / 1000)) return;
        await this.state.revokeSession(sid, exp);
    }
}
