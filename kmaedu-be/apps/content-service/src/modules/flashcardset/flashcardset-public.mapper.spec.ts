import { keysOf } from '../common/keys-deep.test-util';
import {
    toFlashcardSetPublicView,
    toFlashcardSetStudyView,
} from './flashcardset-public.mapper';

const set = {
    id: 's',
    title: 'T',
    description: null,
    userId: 'o',
    thumbnail: null,
    tag: ['a'],
    isPublic: false,
    isPinned: false,
    viewCount: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    accessCode: '123456',
    whitelist: ['u1'],
    createdBy: 'c',
    updatedBy: 'u',
};
const card = {
    id: 'c',
    question: 'Q',
    answer: 'A',
    createdAt: new Date(),
    updatedAt: new Date(),
    secret: 'x',
};
const creator = {
    id: 'o',
    username: 'o',
    name: null,
    avatar: null,
    email: 'o@x.test',
};

describe('flashcard set mappers (gap 3)', () => {
    it('study view has no accessCode, whitelist, audit columns or creator email', () => {
        const keys = keysOf(toFlashcardSetStudyView(set, [card], creator));
        for (const banned of [
            'accessCode',
            'whitelist',
            'createdBy',
            'updatedBy',
            'email',
            'secret',
        ])
            expect(keys).not.toContain(banned);
        expect(keys).toEqual(
            expect.arrayContaining([
                'flashCards',
                'cardCount',
                'creator',
                'tag',
            ])
        );
    });

    it('public view keeps the `tags` spelling and drops the sensitive columns', () => {
        const view = toFlashcardSetPublicView(set, [card]);
        const keys = keysOf(view);
        expect(view.tags).toEqual(['a']);
        for (const banned of ['accessCode', 'whitelist', 'createdBy', 'secret'])
            expect(keys).not.toContain(banned);
    });
});
