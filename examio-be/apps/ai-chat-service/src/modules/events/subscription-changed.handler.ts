import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Envelope, EventHandler, PermanentEventError } from '@examio/messaging';
import { AIChatLimitsService } from '../ai-chat/ai-chat-limits.service';

export const SUBSCRIPTION_CHANGED = 'finance.subscription.changed';

/** `examio.events.v1.SubscriptionChanged`: only the user matters here; the tiers are re-read from finance. */
const payload = z.object({ userId: z.string().min(1) });

/**
 * A plan change (activation, tier change, expiry, reactivation) makes the cached benefits stale: DEL
 * the key so the next message reads the new plan. Idempotent and ordering-free (deleting is right
 * whichever event arrives last), so it runs with `dedupe: false`; a failure rides the consumer's
 * retry / dead-letter path.
 */
@Injectable()
export class SubscriptionChangedHandler {
    constructor(private readonly limits: AIChatLimitsService) {}

    @EventHandler(SUBSCRIPTION_CHANGED, { dedupe: false })
    async onSubscriptionChanged(envelope: Envelope): Promise<void> {
        const parsed = payload.safeParse(envelope.data);
        if (!parsed.success) {
            throw new PermanentEventError('INVALID_DATA', `${SUBSCRIPTION_CHANGED} payload is invalid`);
        }
        await this.limits.invalidate(parsed.data.userId);
    }
}
