import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@kmaedu/redis';
import { GenerationJobRepository } from './generation-job.repository';
import { GENERATION_LOCK_TTL_SECONDS, GenerationType, generationLockKey } from './generation.constants';

/**
 * One generation per user and type at a time (a user may run one quiz and one flashcard job together).
 * Taken before the upload, released on every terminal state of the job; the TTL only bounds a leak.
 */
@Injectable()
export class GenerationLockService {
    private readonly logger = new Logger(GenerationLockService.name);

    constructor(
        private readonly redis: RedisService,
        private readonly jobs: GenerationJobRepository
    ) {}

    /** Atomic (SET NX): two concurrent requests can never both take it. */
    async acquire(userId: string, type: GenerationType): Promise<void> {
        const taken = await this.redis
            .getClient()
            .set(generationLockKey(userId, type), new Date().toISOString(), 'EX', GENERATION_LOCK_TTL_SECONDS, 'NX');
        if (taken !== 'OK') {
            const label = type === 'quiz' ? 'sinh quiz' : 'sinh flashcard';
            throw new ConflictException(
                `Bạn đang có job ${label} chưa hoàn tất. Vui lòng đợi job hiện tại kết thúc.`
            );
        }
    }

    /**
     * Frees the lock a job held when it reached a terminal state, unless the user already has another open
     * job of that type: the lock is then that job's (a request that failed ambiguously released it, the user
     * started again, and the reaper settles the first job much later).
     */
    async releaseAfterTerminal(job: { id: string; userId: string; type: string }): Promise<void> {
        try {
            if (await this.jobs.hasOpenJob(job.userId, job.type, job.id)) return;
        } catch (error) {
            this.logger.warn(`Could not check the open jobs of ${job.userId}: ${(error as Error).message}`);
        }
        await this.release(job.userId, job.type);
    }

    /** Never throws: a failed release only costs the TTL, and must not mask the real outcome. */
    async release(userId: string, type: string): Promise<void> {
        try {
            await this.redis.del(generationLockKey(userId, type === 'flashcard' ? 'flashcard' : 'quiz'));
        } catch (error) {
            this.logger.warn(`Could not release the ${type} generation lock of ${userId}: ${(error as Error).message}`);
        }
    }
}
