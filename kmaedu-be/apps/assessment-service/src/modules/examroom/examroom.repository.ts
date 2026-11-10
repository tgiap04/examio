import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@kmaedu/common';
import { PrismaService } from '../../prisma';
import { RedisService, EXPIRED_TIME } from '@kmaedu/redis';
import { ExamRoom } from '../../prisma';
import { ASSESSMENT_KEY_NAMESPACE } from '../../config/assessment.constants';

@Injectable()
export class ExamRoomRepository extends BaseRepository<ExamRoom> {
    protected modelName = 'examRoom';
    protected cachePrefix = 'examroom';
    protected readonly keyNamespace = ASSESSMENT_KEY_NAMESPACE;
    protected defaultCacheTTL = EXPIRED_TIME.FIVE_MINUTES;

    constructor(prisma: PrismaService, redis: RedisService) {
        super(prisma, redis);
    }

    /**
     * Tìm exam rooms theo host ID
     */
    async findByHostId(
        hostId: string,
        cache = true,
        cacheTTL = this.defaultCacheTTL
    ): Promise<ExamRoom[]> {
        return this.findAll({
            where: { hostId },
            orderBy: { createdAt: 'desc' },
            cache,
            cacheTTL,
        });
    }

    /**
     * Tìm public exam rooms
     */
    async findPublic(
        cache = true,
        cacheTTL = EXPIRED_TIME.TEN_MINUTES
    ): Promise<ExamRoom[]> {
        return this.findAll({
            where: { assessType: 0 }, // 0: PUBLIC
            orderBy: { createdAt: 'desc' },
            cache,
            cacheTTL,
        });
    }

    /**
     * Search exam rooms
     */
    async search(
        query: string,
        onlyPublic = false,
        cache = true,
        cacheTTL = this.defaultCacheTTL
    ): Promise<ExamRoom[]> {
        const where: any = {
            OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
            ],
        };

        if (onlyPublic) {
            where.assessType = 0;
        }

        return this.findAll({
            where,
            orderBy: { createdAt: 'desc' },
            cache,
            cacheTTL,
        });
    }
}
