import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { canAccessFlashcardSet } from '../flashcardset/flashcardset-access';
import { UserEnricher } from '../user-profile/user-enricher.service';

@Injectable()
export class StudentContentService {
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
            progress: progressMap.get(set.id),
        }));

        // Pinned sets first; the sort is stable, so each group keeps the DB order (updatedAt desc).
        formattedSets.sort((a, b) => Number(b.isPinned) - Number(a.isPinned));

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
}
