import { PermanentEventError, type Envelope } from '@kmaedu/messaging';
import { EVENT_HANDLER_METADATA } from '@kmaedu/messaging';
import { QUIZSET_DELETED, QuizSetDeletedHandler } from './quizset-deleted.handler';

const envelope = (data: unknown) => ({ data }) as unknown as Envelope;

function build(rooms: Array<{ id: string; hostId: string }>) {
    const prisma = {
        examRoom: {
            findMany: jest.fn().mockResolvedValue(rooms),
            updateMany: jest.fn().mockResolvedValue({ count: rooms.length }),
        },
    };
    const redis = { del: jest.fn().mockResolvedValue(undefined) };
    const repo = {
        invalidateItemCache: jest.fn().mockResolvedValue(undefined),
        invalidateUserListCache: jest.fn().mockResolvedValue(undefined),
    };
    return { handler: new QuizSetDeletedHandler(prisma as never, redis as never, repo as never), prisma, redis, repo };
}

describe('QuizSetDeletedHandler', () => {
    it('is bound to content.quizset.deleted', () => {
        const meta = Reflect.getMetadata(EVENT_HANDLER_METADATA, QuizSetDeletedHandler.prototype.onQuizSetDeleted);
        expect(meta.type).toBe(QUIZSET_DELETED);
    });

    it('flags the owner\'s rooms, drops their caches and the cached titles', async () => {
        const { handler, prisma, redis, repo } = build([{ id: 'r1', hostId: 'u1' }, { id: 'r2', hostId: 'u1' }]);
        await handler.onQuizSetDeleted(envelope({ quizSetIds: ['qs1', 'qs2'], ownerId: 'u1' }));
        expect(prisma.examRoom.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { quizSetId: { in: ['qs1', 'qs2'] }, hostId: 'u1' } })
        );
        expect(prisma.examRoom.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['r1', 'r2'] } }, data: { sourceDeleted: true } });
        expect(repo.invalidateItemCache).toHaveBeenCalledTimes(2);
        expect(repo.invalidateUserListCache).toHaveBeenCalledTimes(1);
        expect(redis.del).toHaveBeenCalledWith('assessment:cache:quizset:qs1');
        expect(redis.del).toHaveBeenCalledWith('assessment:cache:quizset:qs2');
    });

    it('replaying the same event only repeats idempotent writes (flag stays true, no error)', async () => {
        const { handler, prisma } = build([{ id: 'r1', hostId: 'u1' }]);
        const event = envelope({ quizSetIds: ['qs1'], ownerId: 'u1' });
        await handler.onQuizSetDeleted(event);
        await expect(handler.onQuizSetDeleted(event)).resolves.toBeUndefined();
        for (const call of prisma.examRoom.updateMany.mock.calls) expect(call[0].data).toEqual({ sourceDeleted: true });
    });

    it('no matching room: only the title cache is cleared; a malformed payload is permanent', async () => {
        const { handler, prisma, redis } = build([]);
        await handler.onQuizSetDeleted(envelope({ quizSetIds: ['qs9'], ownerId: 'u1' }));
        expect(prisma.examRoom.updateMany).not.toHaveBeenCalled();
        expect(redis.del).toHaveBeenCalledTimes(1);
        await expect(handler.onQuizSetDeleted(envelope({ quizSetIds: 'qs9' }))).rejects.toBeInstanceOf(PermanentEventError);
    });
});
