import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
    EventHandler,
    PermanentEventError,
    type Envelope,
} from '@examio/messaging';
import { StudyRoomBroadcaster } from './study-room-broadcaster.service';

export const AUTHZ_CHANGED = 'auth.user.authz_changed';

const payload = z.object({
    userId: z.string().min(1),
    authzVersion: z.number().int().nonnegative(),
});

/**
 * A role change or ban must not outlive the socket: every socket of that user
 * whose token is older than the new `authzVersion` gets `auth:reauth
 * {AUTHZ_CHANGED}` and is disconnected. Idempotent by construction (no
 * processed-events row, no DB), so it runs with `dedupe: false`; a thrown
 * error rides the consumer's retry / dead-letter path.
 */
@Injectable()
export class StudyRoomAuthzHandler {
    constructor(private readonly broadcaster: StudyRoomBroadcaster) {}

    @EventHandler(AUTHZ_CHANGED, { dedupe: false })
    async onAuthzChanged(envelope: Envelope): Promise<void> {
        const parsed = payload.safeParse(envelope.data);
        if (!parsed.success) {
            throw new PermanentEventError(
                'INVALID_PAYLOAD',
                `${AUTHZ_CHANGED} payload is malformed`
            );
        }
        await this.broadcaster.reauthStaleSockets(
            parsed.data.userId,
            parsed.data.authzVersion
        );
    }
}
