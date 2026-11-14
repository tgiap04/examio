import { randomUUID } from 'crypto';
import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import type { AuthUser } from '@kmaedu/auth-jwt';
import { grpcErrorToHttpException } from '@kmaedu/grpc';
import type { wordFamilyV1 } from '@kmaedu/contracts';
import { PrismaService } from '../../prisma';
import { VocabularyClient } from '../../clients/vocabulary.client';

/** Escape HTML special characters so catalog text cannot inject markup into a card. */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

@Injectable()
export class WordFamilyToFlashcardService {
    private readonly logger = new Logger(WordFamilyToFlashcardService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly vocabulary: VocabularyClient
    ) {}

    /**
     * Converts selected words of a word family into a private FlashCardSet.
     * One transaction: set + N cards + N join rows. Card ids are assigned here
     * before the insert and exactly those ids are linked (RT-15): cards are never
     * looked up by `question`, which would also match other users' cards.
     */
    async createFlashcardDeck(
        user: AuthUser,
        wordFamilyId: string,
        selectedIndices?: number[]
    ) {
        const family = await this.fetchFamily(wordFamilyId);
        const words = selectedIndices?.length
            ? selectedIndices
                  .filter((i) => i >= 0 && i < family.words.length)
                  .map((i) => family.words[i])
            : family.words;
        if (!words.length) {
            throw new BadRequestException(
                family.words.length
                    ? 'Không có từ vựng hợp lệ được chọn.'
                    : 'Word family không có dữ liệu từ vựng.'
            );
        }

        const cards = words.map((w) => ({
            id: randomUUID(),
            question: `<strong>${escapeHtml(w.word)}</strong> <em>(${escapeHtml(w.pos)})</em>`,
            answer: `<p>${escapeHtml(w.meaningVi)}</p><p><em>"${escapeHtml(w.example)}"</em></p>`,
        }));

        const setId = await this.prisma.$transaction(async (tx) => {
            const set = await tx.flashCardSet.create({
                data: {
                    title: `Gia đình từ: ${family.rootWord}`,
                    description: `${family.categoryName} — Root: ${family.rootWord}`,
                    userId: user.id,
                    isPublic: false,
                    tag: ['word-family', family.categorySlug || 'unknown'],
                },
            });
            await tx.flashCard.createMany({ data: cards });
            await tx.detailsFlashCard.createMany({
                data: cards.map((card) => ({
                    flashCardSetId: set.id,
                    flashCardId: card.id,
                })),
            });
            return set.id;
        });

        this.logger.log(`FlashCard deck created: setId=${setId}, cards=${cards.length}`);
        return {
            message: `Đã tạo bộ flashcard "${family.rootWord}" với ${cards.length} thẻ.`,
            flashCardSetId: setId,
            cardCount: cards.length,
        };
    }

    private async fetchFamily(id: string): Promise<wordFamilyV1.WordFamily> {
        try {
            return await this.vocabulary.getWordFamily(id);
        } catch (error) {
            const code = (error as { code?: unknown } | null)?.code;
            if (code === status.NOT_FOUND) {
                throw new NotFoundException('Không tìm thấy word family.');
            }
            if (code === status.FAILED_PRECONDITION) {
                throw new BadRequestException('Dữ liệu word family không hợp lệ.');
            }
            throw grpcErrorToHttpException(error);
        }
    }
}
