import { PrismaService } from '../../prisma';

/** Exam sessions with this `assessType` are open to every student. */
const ASSESS_PUBLIC = 0;

/**
 * May `userId` pin this exam room? True when a session of the room is public,
 * lists the user, the user already has an attempt in it, or the user hosts it.
 * One `findFirst` with a narrow `select` (no N+1).
 */
export async function canAccessExamRoom(
    prisma: Pick<PrismaService, 'examSession'>,
    examRoomId: string,
    userId: string
): Promise<boolean> {
    const session = await prisma.examSession.findFirst({
        where: {
            examRoomId,
            OR: [
                { assessType: ASSESS_PUBLIC },
                { whitelist: { has: userId } },
                { examAttempts: { some: { userId } } },
                { examRoom: { hostId: userId } },
            ],
        },
        select: { id: true },
    });
    return session !== null;
}
