import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { canAccessFlashcardSet } from '../flashcardset/flashcardset-access';

@Injectable()
export class FlashcardStudyService {
    constructor(private readonly prisma: PrismaService) {}

    /** Gap 7: progress is only kept for sets the user may study (public, own, whitelisted). */
    private async assertCanStudy(userId: string, flashCardSetId: string) {
        if (!(await canAccessFlashcardSet(this.prisma, flashCardSetId, userId))) {
            throw new NotFoundException('Flashcard set not found');
        }
    }

    async addStudiedCard(userId: string, flashCardSetId: string, cardId: string) {
        await this.assertCanStudy(userId, flashCardSetId);
        const existing = await this.prisma.flashcardStudyProgress.findUnique({
            where: { userId_flashCardSetId: { userId, flashCardSetId } },
        });

        if (existing) {
            if (existing.studiedCardIds.includes(cardId)) {
                return {
                    studiedCardIds: existing.studiedCardIds,
                    totalCards: existing.totalCards,
                    progressPercentage: existing.totalCards > 0
                        ? Math.round((existing.studiedCardIds.length / existing.totalCards) * 100)
                        : 0,
                };
            }

            const updated = await this.prisma.flashcardStudyProgress.update({
                where: { userId_flashCardSetId: { userId, flashCardSetId } },
                data: { studiedCardIds: { push: cardId } },
            });

            return {
                studiedCardIds: updated.studiedCardIds,
                totalCards: updated.totalCards,
                progressPercentage: updated.totalCards > 0
                    ? Math.round((updated.studiedCardIds.length / updated.totalCards) * 100)
                    : 0,
            };
        }

        const flashCardSet = await this.prisma.flashCardSet.findUnique({
            where: { id: flashCardSetId },
            include: { detailsFlashCard: { select: { id: true } } },
        });

        if (!flashCardSet) {
            throw new NotFoundException('Flashcard set not found');
        }

        const totalCards = flashCardSet.detailsFlashCard.length;
        const created = await this.prisma.flashcardStudyProgress.create({
            data: {
                userId,
                flashCardSetId,
                studiedCardIds: [cardId],
                totalCards,
            },
        });

        return {
            studiedCardIds: created.studiedCardIds,
            totalCards: created.totalCards,
            progressPercentage: totalCards > 0
                ? Math.round((1 / totalCards) * 100)
                : 0,
        };
    }

    async saveProgress(userId: string, flashCardSetId: string, studiedCardIds: string[]) {
        await this.assertCanStudy(userId, flashCardSetId);
        const flashCardSet = await this.prisma.flashCardSet.findUnique({
            where: { id: flashCardSetId },
            include: { detailsFlashCard: { select: { id: true } } },
        });

        if (!flashCardSet) {
            throw new NotFoundException('Flashcard set not found');
        }

        const totalCards = flashCardSet.detailsFlashCard.length;

        const progress = await this.prisma.flashcardStudyProgress.upsert({
            where: {
                userId_flashCardSetId: { userId, flashCardSetId },
            },
            create: {
                userId,
                flashCardSetId,
                studiedCardIds,
                totalCards,
            },
            update: {
                studiedCardIds,
                totalCards,
            },
        });

        return {
            studiedCardIds: progress.studiedCardIds,
            totalCards: progress.totalCards,
            progressPercentage: totalCards > 0
                ? Math.round((progress.studiedCardIds.length / totalCards) * 100)
                : 0,
        };
    }

    async getProgress(userId: string, flashCardSetId: string) {
        await this.assertCanStudy(userId, flashCardSetId);
        const progress = await this.prisma.flashcardStudyProgress.findUnique({
            where: {
                userId_flashCardSetId: { userId, flashCardSetId },
            },
        });

        if (!progress) {
            const flashCardSet = await this.prisma.flashCardSet.findUnique({
                where: { id: flashCardSetId },
                include: { detailsFlashCard: { select: { id: true } } },
            });

            if (!flashCardSet) {
                throw new NotFoundException('Flashcard set not found');
            }

            return {
                studiedCardIds: [],
                totalCards: flashCardSet.detailsFlashCard.length,
                progressPercentage: 0,
            };
        }

        return {
            studiedCardIds: progress.studiedCardIds,
            totalCards: progress.totalCards,
            progressPercentage: progress.totalCards > 0
                ? Math.round((progress.studiedCardIds.length / progress.totalCards) * 100)
                : 0,
        };
    }

    async getProgressBatch(userId: string, flashCardSetIds: string[]) {
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

        return progressMap;
    }
}
