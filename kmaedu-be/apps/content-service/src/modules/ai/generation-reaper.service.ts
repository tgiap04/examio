import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { GenerationJobService, ReapResult } from './generation-job.service';
import { REAPER_INTERVAL_MS } from './generation.constants';

const nothingReaped = (): ReapResult => ({ timedOut: 0 });

/**
 * Worker role, the generation watchdog. Every minute, QUEUED / PROCESSING jobs silent for
 * GENERATION_JOB_TIMEOUT_MINUTES are failed (`GENERATION_TIMEOUT`) and their generation lock is freed.
 * Safe on several instances: every transition is conditional. It never calls document-service
 * (service tokens are refused there).
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
            if (result.timedOut > 0) this.logger.log(`Timed out ${result.timedOut} silent generation job(s)`);
            return result;
        } catch (error) {
            this.logger.error(`Generation reaper pass failed: ${(error as Error).message}`);
            return nothingReaped();
        } finally {
            this.running = false;
        }
    }
}
