import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { canAccessFlashcardSet } from '../flashcardset/flashcardset-access';
import { canAccessExamRoom } from './student-access';
import { UserEnricher } from '../user-profile/user-enricher.service';

@Injectable()
export class StudentService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly users: UserEnricher
    ) {}

    async getRecentFlashcards(userId: string, limit: number, page: number) {
        const skip = (page - 1) * limit;

        // Sets the user may open AND has a relation to (own, whitelisted, or
        // viewed before): never every public set on the platform.
        const where = {
            AND: [
                {
                    OR: [
                        { isPublic: true },
                        { userId },
                        { whitelist: { has: userId } },
                    ],
                },
                {
                    OR: [
                        { userId },
                        { whitelist: { has: userId } },
                        { viewHistories: { some: { userId } } },
                    ],
                },
            ],
        };

        const [flashcardSets, total] = await Promise.all([
            this.prisma.flashCardSet.findMany({
                where,
                include: {
                    _count: {
                        select: { detailsFlashCard: true },
                    },
                    userPins: {
                        where: { userId },
                        select: { pinnedAt: true },
                    },
                },
                orderBy: [
                    { updatedAt: 'desc' },
                ],
                skip,
                take: limit,
            }),
            this.prisma.flashCardSet.count({ where }),
        ]);

        const flashCardSetIds = flashcardSets.map((set) => set.id);
        const progressRecords = await this.prisma.flashcardStudyProgress.findMany({
            where: {
                userId,
                flashCardSetId: { in: flashCardSetIds },
            },
            select: {
                flashCardSetId: true,
                studiedCardIds: true,
                totalCards: true,
            },
        });

        const progressMap = new Map<string, number>();
        for (const record of progressRecords) {
            const percentage = record.totalCards > 0
                ? Math.round((record.studiedCardIds.length / record.totalCards) * 100)
                : 0;
            progressMap.set(record.flashCardSetId, percentage);
        }

        // Creator display data lives in auth: one batched lookup for the page.
        const creators = await this.users.profileMap(
            flashcardSets.map((set) => set.userId)
        );

        const formattedSets = flashcardSets.map((set) => ({
            id: set.id,
            title: set.title,
            description: set.description,
            thumbnail: set.thumbnail,
            viewCount: set.viewCount,
            flashcardCount: set._count.detailsFlashCard,
            lastViewedAt: set.updatedAt.toISOString(),
            createdAt: set.createdAt.toISOString(),
            creator: creators.get(set.userId) ?? null,
            isPublic: set.isPublic,
            isPinned: set.userPins.length > 0,
            progress: progressMap.get(set.id) ?? undefined,
        }));

        // Sort: pinned first (by pinnedAt desc), then non-pinned
        formattedSets.sort((a, b) => {
            const aPinned = a.isPinned ? 1 : 0;
            const bPinned = b.isPinned ? 1 : 0;
            if (aPinned !== bPinned) return bPinned - aPinned;
            return 0; // keep DB order (updatedAt desc) for same pin status
        });

        return {
            flashcardSets: formattedSets,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async togglePinFlashcard(userId: string, flashcardSetId: string) {
        const existing = await this.prisma.userPinnedFlashcard.findUnique({
            where: {
                userId_flashcardSetId: { userId, flashcardSetId },
            },
        });

        // Unpinning is always allowed (cleans up a set that is no longer shared).
        if (existing) {
            await this.prisma.userPinnedFlashcard.delete({
                where: { id: existing.id },
            });
            return { pinned: false };
        }

        if (!(await canAccessFlashcardSet(this.prisma, flashcardSetId, userId))) {
            throw new NotFoundException('Flashcard set not found');
        }

        await this.prisma.userPinnedFlashcard.create({
            data: { userId, flashcardSetId },
        });
        return { pinned: true };
    }

    async togglePinExamRoom(userId: string, examRoomId: string) {
        const existing = await this.prisma.userPinnedExamRoom.findUnique({
            where: {
                userId_examRoomId: { userId, examRoomId },
            },
        });

        if (existing) {
            await this.prisma.userPinnedExamRoom.delete({
                where: { id: existing.id },
            });
            return { pinned: false };
        }

        if (!(await canAccessExamRoom(this.prisma, examRoomId, userId))) {
            throw new NotFoundException('Exam room not found');
        }

        await this.prisma.userPinnedExamRoom.create({
            data: { userId, examRoomId },
        });
        return { pinned: true };
    }

    async getRecentExams(userId: string, limit: number, page: number = 1) {
        const skip = (page - 1) * limit;

        const where = { userId };

        const [examAttempts, total, pinnedRooms] = await Promise.all([
            this.prisma.examAttempt.findMany({
                where,
                include: {
                    examSession: {
                        include: {
                            examRoom: {
                                select: {
                                    id: true,
                                    title: true,
                                    description: true,
                                },
                            },
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.examAttempt.count({ where }),
            this.prisma.userPinnedExamRoom.findMany({
                where: { userId },
                select: { examRoomId: true },
            }),
        ]);

        const pinnedRoomIds = new Set(pinnedRooms.map((p) => p.examRoomId));

        const formattedExamAttempts = examAttempts.map((attempt) => {
            const timeLimitMinutes = attempt.examSession.timeLimitMinutes;
            let timeRemaining: number | null = null;

            if (attempt.status === 0 && timeLimitMinutes) {
                const startedAt = new Date(attempt.startedAt).getTime();
                const now = Date.now();
                const elapsedMinutes = (now - startedAt) / (1000 * 60);
                timeRemaining = Math.max(0, timeLimitMinutes - elapsedMinutes);
            }

            return {
                id: attempt.id,
                examSessionId: attempt.examSessionId,
                score: attempt.score,
                violationCount: attempt.violationCount,
                startedAt: attempt.startedAt.toISOString(),
                finishedAt: attempt.finishedAt?.toISOString() || null,
                status: attempt.status,
                totalQuestions: attempt.totalQuestions,
                correctAnswers: attempt.correctAnswers,
                timeRemaining,
                isPinned: pinnedRoomIds.has(attempt.examSession.examRoom.id),
                examSession: {
                    id: attempt.examSession.id,
                    startTime: attempt.examSession.startTime.toISOString(),
                    endTime: attempt.examSession.endTime?.toISOString() || null,
                    timeLimitMinutes: attempt.examSession.timeLimitMinutes,
                    showAnswersAfterSubmit: attempt.examSession.showAnswersAfterSubmit,
                    examRoom: attempt.examSession.examRoom,
                },
            };
        });

        return {
            examAttempts: formattedExamAttempts,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
}
