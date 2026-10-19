import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { OutboxService } from '@examio/messaging';
import type { SessionRevoked } from '@examio/contracts/generated/examio/events/v1/auth_events';

export const SESSION_REVOKED = 'auth.session.revoked';

/**
 * `auth.session.revoked` (fact event), always written inside the transaction
 * that deactivates the session, so the gateway's durable consumer learns about
 * every committed revocation even if the gRPC fast path is lost.
 */
@Injectable()
export class SessionRevokedPublisher {
    constructor(private readonly outbox: OutboxService) {}

    async publish(
        tx: Prisma.TransactionClient,
        session: { userId: string; sid: string; exp: number },
        revokedAtSeconds: number = Math.floor(Date.now() / 1000)
    ): Promise<void> {
        const data: SessionRevoked = {
            userId: session.userId,
            sid: session.sid,
            exp: String(session.exp),
            version: String(revokedAtSeconds),
        };
        await this.outbox.add(tx, SESSION_REVOKED, data);
    }
}
