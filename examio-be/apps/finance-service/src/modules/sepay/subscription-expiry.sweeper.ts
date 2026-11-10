import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SubscriptionExpiryService } from './subscription-expiry.service';

export const DEFAULT_EXPIRY_SWEEP_MS = 60_000;
export const EXPIRY_SWEEP_BATCH = 200;

/** `SUBSCRIPTION_EXPIRY_SWEEP_MS`: positive integer ms, otherwise the default. */
export function resolveSweepIntervalMs(raw: string | undefined): number {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : DEFAULT_EXPIRY_SWEEP_MS;
}

/**
 * Worker-role sweeper: flips lapsed subscriptions even when nobody reads them, so the
 * tier -> 0 event is published without waiting for a request. Safe on several replicas
 * (see `SubscriptionExpiryService.expireIfLapsed`); `tick` never throws.
 */
@Injectable()
export class SubscriptionExpirySweeper implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SubscriptionExpirySweeper.name);
    private timer?: NodeJS.Timeout;
    private running = false;

    constructor(private readonly expiry: SubscriptionExpiryService) {}

    onModuleInit(): void {
        const everyMs = resolveSweepIntervalMs(process.env.SUBSCRIPTION_EXPIRY_SWEEP_MS);
        this.timer = setInterval(() => void this.tick(), everyMs);
        this.timer.unref();
    }

    onModuleDestroy(): void {
        if (this.timer) clearInterval(this.timer);
    }

    /** Drains lapsed rows in batches; returns how many this tick flipped. */
    async tick(now: Date = new Date()): Promise<number> {
        if (this.running) return 0;
        this.running = true;
        let flipped = 0;
        try {
            for (;;) {
                const ids = await this.expiry.findLapsedUserIds(EXPIRY_SWEEP_BATCH, now);
                let batchFlipped = 0;
                for (const userId of ids) {
                    try {
                        if (await this.expiry.expireIfLapsed(userId, now)) batchFlipped++;
                    } catch (err) {
                        this.logger.error(`expiry flip failed for user ${userId}: ${(err as Error).message}`);
                    }
                }
                flipped += batchFlipped;
                // Stop on a short batch, or when nothing flipped (rows failing/claimed elsewhere) to avoid spinning.
                if (ids.length < EXPIRY_SWEEP_BATCH || batchFlipped === 0) break;
            }
        } catch (err) {
            this.logger.error(`expiry sweep failed: ${(err as Error).message}`);
        } finally {
            this.running = false;
        }
        if (flipped > 0) this.logger.log(`expired ${flipped} subscription(s)`);
        return flipped;
    }
}
