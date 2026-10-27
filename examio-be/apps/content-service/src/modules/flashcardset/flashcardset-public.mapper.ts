/**
 * Whitelist-based output for payloads a STUDENT or an anonymous caller sees.
 * Fields are picked by name (never `...entity`) so a new column can not leak
 * `accessCode`, `whitelist` or audit columns by accident.
 */
interface CardRow {
    id: string;
    question: string;
    answer: string;
    createdAt: Date | string;
    updatedAt: Date | string;
}

interface SetRow {
    id: string;
    title: string;
    description: string | null;
    userId: string;
    thumbnail: string | null;
    tag: string[];
    isPublic: boolean;
    isPinned: boolean;
    viewCount: number;
    createdAt: Date | string;
    updatedAt: Date | string;
}

const pickCard = (c: CardRow) => ({
    id: c.id,
    question: c.question,
    answer: c.answer,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
});

const pickSet = (s: SetRow) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    userId: s.userId,
    thumbnail: s.thumbnail,
    isPublic: s.isPublic,
    isPinned: s.isPinned,
    viewCount: s.viewCount,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
});

export interface Creator {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
}

const pickCreator = (u: Creator): Creator => ({
    id: u.id,
    username: u.username,
    name: u.name,
    avatar: u.avatar,
});

/** `GET study/:id` and `POST study/:id/with-code`. */
export function toFlashcardSetStudyView(
    set: SetRow,
    cards: CardRow[],
    creator: Creator | null
) {
    return {
        ...pickSet(set),
        tag: set.tag,
        flashCards: cards.map(pickCard),
        cardCount: cards.length,
        creator: creator ? pickCreator(creator) : creator,
    };
}

/** `GET public/:id` (anonymous): same fields, `tags` spelling kept for the existing consumer. */
export function toFlashcardSetPublicView(set: SetRow, cards: CardRow[]) {
    return {
        ...pickSet(set),
        tags: set.tag,
        flashCards: cards.map(pickCard),
    };
}
