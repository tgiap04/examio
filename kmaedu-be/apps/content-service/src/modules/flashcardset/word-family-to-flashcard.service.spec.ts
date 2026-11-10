import { status } from '@grpc/grpc-js';
import { HttpException } from '@nestjs/common';
import type { wordFamilyV1 } from '@kmaedu/contracts';
import type { AuthUser } from '@kmaedu/auth-jwt';
import type { PrismaService } from '../../prisma';
import type { VocabularyClient } from '../../clients/vocabulary.client';
import { WordFamilyToFlashcardService } from './word-family-to-flashcard.service';

const user = { id: 'u1' } as AuthUser;
const family: wordFamilyV1.WordFamily = {
    id: 'wf1',
    rootWord: 'order',
    categorySlug: 'shopping',
    categoryName: 'Mua sắm',
    words: [
        { word: '<b>a</b>', pos: 'n', meaningEn: '', meaningVi: 'một', example: 'say "hi"' },
        { word: 'b', pos: 'v', meaningEn: '', meaningVi: 'hai', example: 'e2' },
        { word: 'c', pos: 'adj', meaningEn: '', meaningVi: 'ba', example: 'e3' },
    ],
};

function setup(get: jest.Mock) {
    const tx = {
        flashCardSet: { create: jest.fn().mockResolvedValue({ id: 'set1' }) },
        flashCard: { createMany: jest.fn().mockResolvedValue({ count: 0 }), findMany: jest.fn() },
        detailsFlashCard: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma = { $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
    const service = new WordFamilyToFlashcardService(
        prisma as unknown as PrismaService,
        { getWordFamily: get } as unknown as VocabularyClient
    );
    return { service, tx, prisma };
}

const rpcError = (code: status) => Object.assign(new Error(status[code]), { code });

describe('WordFamilyToFlashcardService', () => {
    it('creates the set and cards, linking exactly the ids it assigned (RT-15)', async () => {
        const { service, tx } = setup(jest.fn().mockResolvedValue(family));
        const res = await service.createFlashcardDeck(user, 'wf1');

        expect(res).toMatchObject({ flashCardSetId: 'set1', cardCount: 3 });
        const cards = tx.flashCard.createMany.mock.calls[0][0].data as Array<{ id: string }>;
        expect(cards).toHaveLength(3);
        expect(new Set(cards.map((c) => c.id)).size).toBe(3);
        const links = tx.detailsFlashCard.createMany.mock.calls[0][0].data as Array<{
            flashCardSetId: string;
            flashCardId: string;
        }>;
        expect(links.map((l) => l.flashCardId)).toEqual(cards.map((c) => c.id));
        expect(links.every((l) => l.flashCardSetId === 'set1')).toBe(true);
        // never a lookup by question: it would also match other users' cards
        expect(tx.flashCard.findMany).not.toHaveBeenCalled();
        expect(tx.flashCardSet.create.mock.calls[0][0].data).toMatchObject({
            userId: 'u1',
            isPublic: false,
            title: 'Gia đình từ: order',
            tag: ['word-family', 'shopping'],
        });
    });

    it('escapes HTML in the catalog text', async () => {
        const { service, tx } = setup(jest.fn().mockResolvedValue(family));
        await service.createFlashcardDeck(user, 'wf1', [0]);
        const [card] = tx.flashCard.createMany.mock.calls[0][0].data as Array<{
            question: string;
            answer: string;
        }>;
        expect(card.question).toBe('<strong>&lt;b&gt;a&lt;/b&gt;</strong> <em>(n)</em>');
        expect(card.answer).toBe('<p>một</p><p><em>"say &quot;hi&quot;"</em></p>');
    });

    it('keeps only in-range selected indices', async () => {
        const { service, tx } = setup(jest.fn().mockResolvedValue(family));
        const res = await service.createFlashcardDeck(user, 'wf1', [2, 99, -1]);
        expect(res.cardCount).toBe(1);
        expect(tx.flashCard.createMany.mock.calls[0][0].data).toHaveLength(1);
    });

    it('400 when no selected index is valid, without opening a transaction', async () => {
        const { service, prisma } = setup(jest.fn().mockResolvedValue(family));
        await expect(service.createFlashcardDeck(user, 'wf1', [99])).rejects.toMatchObject({ status: 400 });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('vocabulary NOT_FOUND is 404', async () => {
        const { service, prisma } = setup(jest.fn().mockRejectedValue(rpcError(status.NOT_FOUND)));
        await expect(service.createFlashcardDeck(user, 'x')).rejects.toMatchObject({ status: 404 });
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('vocabulary FAILED_PRECONDITION is 400', async () => {
        const { service } = setup(jest.fn().mockRejectedValue(rpcError(status.FAILED_PRECONDITION)));
        await expect(service.createFlashcardDeck(user, 'x')).rejects.toMatchObject({ status: 400 });
    });

    it('vocabulary down surfaces as 503, not a silent success', async () => {
        const { service } = setup(jest.fn().mockRejectedValue(rpcError(status.UNAVAILABLE)));
        const err = await service.createFlashcardDeck(user, 'x').catch((e: unknown) => e);
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(503);
    });
});
