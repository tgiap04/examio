import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
    EventHandler,
    PermanentEventError,
    type Envelope,
} from '@kmaedu/messaging';
import { PublicProfileClient } from '@kmaedu/grpc';

export const USER_UPDATED = 'auth.user.updated';

/** Mirrors proto `kmaedu.events.v1.UserUpdated` (only `userId` matters here). */
const payload = z.object({ userId: z.string().min(1) });

/**
 * A profile edit makes the cached public projection stale: DEL it so the next
 * read refetches. Idempotent by construction and ordering-free (deleting is
 * correct whichever event arrives last), so it runs with `dedupe: false`; a
 * thrown error rides the consumer's retry / dead-letter path.
 */
@Injectable()
export class UserUpdatedHandler {
    constructor(private readonly auth: PublicProfileClient) {}

    @EventHandler(USER_UPDATED, { dedupe: false })
    async onUserUpdated(envelope: Envelope): Promise<void> {
        const parsed = payload.safeParse(envelope.data);
        if (!parsed.success) {
            throw new PermanentEventError(
                'INVALID_PAYLOAD',
                `${USER_UPDATED} payload is malformed`
            );
        }
        await this.auth.invalidate(parsed.data.userId);
    }
}
