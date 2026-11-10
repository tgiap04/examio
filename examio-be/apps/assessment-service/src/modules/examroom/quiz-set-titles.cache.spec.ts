import { Metadata } from '@grpc/grpc-js';
import { QuizSetTitles, quizSetTitleKey, toQuizSetBrief } from './quiz-set-titles.cache';

const md = new Metadata();

function build(cache: Record<string, unknown> = {}, getQuizSetsByIds = jest.fn()) {
    const store = new Map(Object.entries(cache));
    const redis = {
        get: jest.fn(async (k: string) => store.get(k) ?? null),
        set: jest.fn(async (k: string, v: unknown) => void store.set(k, v)),
    };
    return { titles: new QuizSetTitles({ getQuizSetsByIds } as never, redis as never), getQuizSetsByIds, store };
}

describe('QuizSetTitles', () => {
    it('one batch call for the ids the cache lacks, then cached under assessment:cache:quizset:<id>', async () => {
        const call = jest.fn().mockResolvedValue([
            { id: 'b', title: 'Bee', questionCount: 4 },
            { id: 'c', title: 'Sea', questionCount: 0 },
        ]);
        const { titles, store } = build({ [quizSetTitleKey('a')]: { title: 'Ay', questionCount: 9 } }, call);
        const map = await titles.summariesFor(['a', 'b', 'c', 'b'], md);
        expect(call).toHaveBeenCalledTimes(1);
        expect(call).toHaveBeenCalledWith(['b', 'c'], md);
        expect([...map.entries()].sort()).toEqual([
            ['a', { title: 'Ay', questionCount: 9 }],
            ['b', { title: 'Bee', questionCount: 4 }],
            ['c', { title: 'Sea', questionCount: 0 }],
        ]);
        expect(store.get('assessment:cache:quizset:b')).toEqual({ title: 'Bee', questionCount: 4 });
        await titles.summariesFor(['a', 'b', 'c'], md);
        expect(call).toHaveBeenCalledTimes(1);
    });

    it('a cache entry in the old shape (a bare title) is a miss, not a crash', async () => {
        const call = jest.fn().mockResolvedValue([{ id: 'a', title: 'Ay', questionCount: 2 }]);
        const { titles } = build({ [quizSetTitleKey('a')]: 'Ay' }, call);
        expect((await titles.summariesFor(['a'], md)).get('a')).toEqual({ title: 'Ay', questionCount: 2 });
        expect(call).toHaveBeenCalledTimes(1);
    });

    it('teacher views carry quizSet.questionCount; student briefs never do', async () => {
        const call = jest.fn().mockResolvedValue([{ id: 'q', title: 'Quiz', questionCount: 12 }]);
        const { titles } = build({}, call);
        const [room] = await titles.withQuizSets([{ quizSetId: 'q', quizSetTitle: 'Stored' }], md);
        expect(room.quizSet).toEqual({ id: 'q', title: 'Quiz', description: null, thumbnail: null, questionCount: 12 });
        expect(toQuizSetBrief({ quizSetId: 'q', quizSetTitle: 'Stored' })).not.toHaveProperty('questionCount');
    });

    it('fails soft: an outage leaves the title stored on the room', async () => {
        const { titles } = build({}, jest.fn().mockRejectedValue(new Error('down')));
        const [room] = await titles.withQuizSets([{ quizSetId: 'q', quizSetTitle: 'Stored' }], md);
        expect(room.quizSet).toEqual({ id: 'q', title: 'Stored', description: null, thumbnail: null });
    });

    it('a fresh title wins over the stored one; an empty page makes no call', async () => {
        const call = jest.fn().mockResolvedValue([{ id: 'q', title: 'Renamed' }]);
        const { titles } = build({}, call);
        expect((await titles.withQuizSets([{ quizSetId: 'q', quizSetTitle: 'Old' }], md))[0].quizSet.title).toBe('Renamed');
        call.mockClear();
        expect(await titles.withQuizSets([], md)).toEqual([]);
        expect(call).not.toHaveBeenCalled();
    });
});
