import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
    PENDING_CHARGE_TIMEOUT_MS,
    REAPER_BATCH,
    REAPER_INTERVAL_MS,
    REFUND_SWEEP_GRACE_MS,
} from '../../config/document.constants';
import { DocumentChargeService } from './document-charge.service';
import { DocumentRepository } from './document.repository';

/**
 * Worker role. Every minute: (1) rows stuck in PENDING_CHARGE for more than 10 minutes (a crash between
 * the debit and the queueing tx) are claimed FAILED with their R2 key queued, then get a compensating
 * `Refund(doc:<id>)` (NOT_FOUND = never charged); (2) every charge-failed row whose refund is still open
 * (finance was down, or the debit's answer was lost) is refunded again, a NOT_FOUND settling only after
 * `REFUND_SWEEP_GRACE_MS`. Safe on several instances: every step is conditional and the refund is idempotent.
 */
@Injectable()
export class DocumentReaper implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(DocumentReaper.name);
    private timer?: NodeJS.Timeout;
    private running = false;

    constructor(
        private readonly repo: DocumentRepository,
        private readonly charge: DocumentChargeService
    ) {}

    onModuleInit(): void {
        this.timer = setInterval(() => void this.tick(), REAPER_INTERVAL_MS);
        this.timer.unref();
    }

    onModuleDestroy(): void {
        if (this.timer) clearInterval(this.timer);
    }

    /** One pass; returns how many rows were claimed or had a refund settled. Never throws (the next tick retries failures). */
    async tick(now = new Date()): Promise<number> {
        if (this.running) return 0;
        this.running = true;
        let settled = 0;
        try {
            const stuck = await this.repo.findStuckCharges(new Date(now.getTime() - PENDING_CHARGE_TIMEOUT_MS), REAPER_BATCH);
            for (const doc of stuck) {
                try {
                    if (await this.charge.failStuck(doc, now)) settled += 1;
                } catch (error) {
                    this.logger.warn(`Could not settle ${doc.id}, will retry: ${(error as Error).message}`);
                }
            }
            const open = await this.repo.findOpenRefunds(new Date(now.getTime() - REFUND_SWEEP_GRACE_MS), REAPER_BATCH);
            for (const doc of open) {
                if (await this.charge.settleRefund(doc, true, now)) settled += 1;
            }
            if (settled > 0) this.logger.log(`Settled ${settled} stuck upload charge(s) / open refund(s)`);
        } catch (error) {
            this.logger.error(`Reaper pass failed: ${(error as Error).message}`);
        } finally {
            this.running = false;
        }
        return settled;
    }
}
