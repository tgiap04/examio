import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { GenerationJobService, ReapResult } from './generation-job.service';
import { REAPER_INTERVAL_MS } from './generation.constants';

const nothingReaped = (): ReapResult => ({ cancelled: 0, timedOut: 0, refunded: 0 });

/**
 * Worker role. Every minute: PENDING_CHARGE jobs older than 10 minutes (a crash between the debit and
 * the queueing tx) are cancelled and refunded, and FAILED / CANCELLED jobs whose refund never completed
 * are refunded; QUEUED / PROCESSING jobs silent for GENERATION_JOB_TIMEOUT_MINUTES are failed and
 * refunded. Safe on several instances: every step is conditional and the refund is idempotent.
 * It never calls document-service (service tokens are refused there).
 */
@Injectable()
export class GenerationReaper implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(GenerationReaper.name);
    private timer?: NodeJS.Timeout;
    private running = false;

    constructor(private readonly generation: GenerationJobService) {}

    onModuleInit(): void {
        this.timer = setInterval(() => void this.tick(), REAPER_INTERVAL_MS);
        this.timer.unref();
    }

    onModuleDestroy(): void {
        if (this.timer) clearInterval(this.timer);
    }

    /** One pass; never throws (the next tick retries whatever failed). */
    async tick(now = new Date()): Promise<ReapResult> {
        if (this.running) return nothingReaped();
        this.running = true;
        try {
            const result = await this.generation.reap(now);
            if (result.cancelled > 0 || result.timedOut > 0 || result.refunded > 0) {
                this.logger.log(
                    `Reaped ${result.cancelled} stuck job(s), timed out ${result.timedOut} silent job(s), settled ${result.refunded} refund(s)`
                );
            }
            return result;
        } catch (error) {
            this.logger.error(`Generation reaper pass failed: ${(error as Error).message}`);
            return nothingReaped();
        } finally {
            this.running = false;
        }
    }
}
