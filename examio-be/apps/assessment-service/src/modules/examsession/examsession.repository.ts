import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@examio/common';
import { PrismaService } from '../../prisma';
import { RedisService, EXPIRED_TIME } from '@examio/redis';
import { ExamSession } from '../../prisma';
import { ASSESSMENT_KEY_NAMESPACE } from '../../config/assessment.constants';

@Injectable()
export class ExamSessionRepository extends BaseRepository<ExamSession> {
    protected modelName = 'examSession';
    protected cachePrefix = 'examsession';
    protected readonly keyNamespace = ASSESSMENT_KEY_NAMESPACE;
    protected defaultCacheTTL = EXPIRED_TIME.FIVE_MINUTES;

    constructor(prisma: PrismaService, redis: RedisService) {
        super(prisma, redis);
    }

    /**
     * Tìm exam sessions theo exam room ID
     */
    async findByExamRoomId(
        examRoomId: string,
        cache = true,
        cacheTTL = this.defaultCacheTTL
    ): Promise<ExamSession[]> {
        return this.findAll({
            where: { examRoomId },
            orderBy: { startTime: 'desc' },
            cache,
            cacheTTL,
        });
    }

    /**
     * Tìm ongoing sessions
     */
    async findOngoing(
        cache = true,
        cacheTTL = EXPIRED_TIME.ONE_MINUTE
    ): Promise<ExamSession[]> {
        return this.findAll({
            where: { status: 1 }, // 1: ONGOING
            orderBy: { startTime: 'desc' },
            cache,
            cacheTTL,
        });
    }

    /**
     * Update status và invalidate cache
     */
    async updateStatus(id: string, status: number): Promise<ExamSession> {
        const updated = await this.update(id, { status });

        // Invalidate specific caches
        // Only invalidate ongoing cache pattern, not all cache
        if (status === 1) {
            // If status is ONGOING, others might need updated list
            await this.redis.delPattern(`${this.keyNamespace}${this.cachePrefix}:ongoing:*`);
        }

        return updated;
    }
}
