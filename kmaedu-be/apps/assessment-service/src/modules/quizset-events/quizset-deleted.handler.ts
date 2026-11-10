import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { RedisService } from '@kmaedu/redis';
import { EventHandler, PermanentEventError, type Envelope } from '@kmaedu/messaging';
import { PrismaService } from '../../prisma';
import { ExamRoomRepository } from '../examroom/examroom.repository';
import { quizSetTitleKey } from '../examroom/quiz-set-titles.cache';

export const QUIZSET_DELETED = 'content.quizset.deleted';

/** Mirrors proto `kmaedu.events.v1.ContentQuizSetDeleted` (camelCase on the wire, like every outbox payload). */
const payload = z.object({
    quizSetIds: z.array(z.string().min(1)).max(500),
    ownerId: z.string().min(1),
});

/**
 * A quiz set was deleted in content-service: the rooms built on it are flagged `sourceDeleted` (no
 * new session can be made from them) and the cached title goes. Existing sessions are untouched: they
 * hold their own snapshot, so running exams and results never change. Idempotent by construction
 * (a flag that only ever flips to true, a DEL), so a replay changes nothing and needs no ledger row;
 * a thrown error rides the consumer's retry / dead-letter path.
 */
@Injectable()
export class QuizSetDeletedHandler {
    private readonly logger = new Logger(QuizSetDeletedHandler.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
        private readonly rooms: ExamRoomRepository
    ) {}

    @EventHandler(QUIZSET_DELETED, { dedupe: false })
    async onQuizSetDeleted(envelope: Envelope): Promise<void> {
        const parsed = payload.safeParse(envelope.data);
        if (!parsed.success) {
            throw new PermanentEventError('INVALID_PAYLOAD', `${QUIZSET_DELETED} payload is malformed`);
        }
        const { quizSetIds, ownerId } = parsed.data;
        if (quizSetIds.length === 0) return;

        // Only the deleting owner's rooms: a set is only ever deleted by its owner, and a room of
        // someone else that names the same id must not be affected by a forged event.
        const affected = await this.prisma.examRoom.findMany({
            where: { quizSetId: { in: quizSetIds }, hostId: ownerId },
            select: { id: true, hostId: true },
        });
        if (affected.length > 0) {
            await this.prisma.examRoom.updateMany({
                where: { id: { in: affected.map((r) => r.id) } },
                data: { sourceDeleted: true },
            });
            // The room rows (and the session create that reads them) are cached in Redis.
            for (const room of affected) {
                await this.rooms.invalidateItemCache(room.hostId, room.id);
            }
            for (const hostId of new Set(affected.map((r) => r.hostId))) {
                await this.rooms.invalidateUserListCache(hostId);
            }
        }
        await Promise.all(quizSetIds.map((id) => this.redis.del(quizSetTitleKey(id))));
        this.logger.log(`quiz sets deleted: ${quizSetIds.length}, rooms flagged: ${affected.length}`);
    }
}
