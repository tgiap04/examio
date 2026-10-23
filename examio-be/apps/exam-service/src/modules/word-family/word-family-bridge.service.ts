import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';

import { WordFamilyRepository } from './word-family.repository';
import type { AuthUser } from '@examio/auth-jwt';

@Injectable()
export class WordFamilyBridgeService {
    private readonly logger = new Logger(WordFamilyBridgeService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly repository: WordFamilyRepository,
    ) {}

    /**
     * Convert selected words from a WordFamily into a FlashCard deck.
     * Uses Prisma transaction: create FlashCardSet + N FlashCards + N DetailsFlashCards.
     */
    async createFlashcardDeck(
        user: AuthUser,
        wordFamilyId: string,
        selectedIndices?: number[],
    ) {
        const family = await this.repository.findWordFamilyById(wordFamilyId);
        if (!family) {
            throw new NotFoundException('Không tìm thấy word family.');
        }

        const familyData = family.data as any;
        if (!familyData?.rootWord || !Array.isArray(familyData.words)) {
            throw new BadRequestException('Dữ liệu word family không hợp lệ.');
        }

        if (!familyData.words.length) {
            throw new BadRequestException(
                'Word family không có dữ liệu từ vựng.',
            );
        }

        // Filter selected words or take all
        const words =
            selectedIndices?.length
                ? selectedIndices
                    .filter((i) => i >= 0 && i < familyData.words.length)
                    .map((i) => familyData.words[i])
                : familyData.words;

        if (!words.length) {
            throw new BadRequestException(
                'Không có từ vựng hợp lệ được chọn.',
            );
        }

        // Find category name for title
        const category = await this.repository.findCategoryBySlug(
            familyData.categorySlug,
        );
        const categoryName = category?.name || familyData.categorySlug;

        // Build flashcard data (escape HTML to prevent injection)
        const flashcards = words.map((w) => ({
            question: `<strong>${this.escapeHtml(w.word)}</strong> <em>(${this.escapeHtml(w.pos)})</em>`,
            answer: `<p>${this.escapeHtml(w.meaningVi)}</p><p><em>"${this.escapeHtml(w.example)}"</em></p>`,
        }));

        // Transaction: create set + cards + join records — all atomic
        const result = await this.prisma.$transaction(async (tx) => {
            const set = await tx.flashCardSet.create({
                data: {
                    title: `Gia đình từ: ${familyData.rootWord}`,
                    description: `${categoryName} — Root: ${familyData.rootWord}`,
                    userId: user.id,
                    isPublic: false,
                    tag: ['word-family', familyData.categorySlug || 'unknown'],
                },
            });

            // Batch insert all flashcards in one atomic operation
            await tx.flashCard.createMany({
                data: flashcards.map((fc) => ({
                    question: fc.question,
                    answer: fc.answer,
                })),
            });

            // Single batch query to get created card IDs
            const cardRecords = await tx.flashCard.findMany({
                where: {
                    question: { in: flashcards.map((fc) => fc.question) },
                },
                select: { id: true },
            });

            // Batch insert join records
            await tx.detailsFlashCard.createMany({
                data: cardRecords.map((card) => ({
                    flashCardSetId: set.id,
                    flashCardId: card.id,
                })),
            });

            return { setId: set.id, cardCount: flashcards.length };
        });

        this.logger.log(
            `FlashCard deck created: setId=${result.setId}, cards=${result.cardCount}`,
        );

        return {
            message: `Đã tạo bộ flashcard "${familyData.rootWord}" với ${result.cardCount} thẻ.`,
            flashCardSetId: result.setId,
            cardCount: result.cardCount,
        };
    }

    /** Escape HTML special characters to prevent XSS injection */
    private escapeHtml(text: string): string {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
