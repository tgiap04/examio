import { QUESTION_SELECTION_MODE } from '../../types';
import { buildSnapshot } from './snapshot.fixture';
import {
    countCorrect,
    labelStats,
    questionsOf,
    selectQuestionIds,
    validateSelectionConfig,
    withAnswer,
    withoutAnswer,
} from './snapshot.reader';

const snapshot = buildSnapshot();
const base = { questionCount: null, labelConfig: null, shuffle: false };
/** Deterministic "random": always picks the first remaining element (Fisher-Yates with j = 0 .. i). */
const first = () => 0;

describe('selectQuestionIds', () => {
    it('ALL keeps every question in snapshot order', () => {
        expect(selectQuestionIds(snapshot, { ...base, mode: QUESTION_SELECTION_MODE.ALL })).toEqual([
            'q1', 'q2', 'q3', 'q4', 'q5',
        ]);
    });

    it('RANDOM_TOTAL draws exactly N distinct questions of the snapshot', () => {
        for (let i = 0; i < 20; i++) {
            const ids = selectQuestionIds(snapshot, { ...base, mode: QUESTION_SELECTION_MODE.RANDOM_TOTAL, questionCount: 3 });
            expect(ids).toHaveLength(3);
            expect(new Set(ids).size).toBe(3);
            for (const id of ids) expect(snapshot.questions.map((q) => q.id)).toContain(id);
        }
    });

    it('RANDOM_BY_LABEL draws only from the named label, and `unlabeled` only from unlabeled questions', () => {
        for (let i = 0; i < 20; i++) {
            const ids = selectQuestionIds(snapshot, {
                ...base,
                mode: QUESTION_SELECTION_MODE.RANDOM_BY_LABEL,
                labelConfig: [
                    { labelId: 'la', count: 2 },
                    { labelId: 'unlabeled', count: 1 },
                ],
            });
            expect(ids).toHaveLength(3);
            expect(ids.slice(0, 2).every((id) => ['q1', 'q2', 'q3'].includes(id))).toBe(true);
            expect(ids[2]).toBe('q5');
        }
    });

    it('never offers a question that is not in the snapshot (a label the snapshot does not have yields nothing)', () => {
        const ids = selectQuestionIds(snapshot, {
            ...base,
            mode: QUESTION_SELECTION_MODE.RANDOM_BY_LABEL,
            labelConfig: [{ labelId: 'label-added-to-the-live-set-later', count: 3 }],
        });
        expect(ids).toEqual([]);
    });

    it('shuffle keeps the same set in a (usually) different order, and is deterministic for a fixed random', () => {
        const a = selectQuestionIds(snapshot, { ...base, mode: QUESTION_SELECTION_MODE.ALL, shuffle: true }, first);
        const b = selectQuestionIds(snapshot, { ...base, mode: QUESTION_SELECTION_MODE.ALL, shuffle: true }, first);
        expect(a).toEqual(b);
        expect([...a].sort()).toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);
        expect(a).not.toEqual(['q1', 'q2', 'q3', 'q4', 'q5']);
    });
});

describe('questionsOf / answer stripping / grading', () => {
    it('returns the selected questions in the attempt order; an attempt that stored none gets all', () => {
        expect(questionsOf(snapshot, ['q4', 'q1']).map((q) => q.id)).toEqual(['q4', 'q1']);
        expect(questionsOf(snapshot, [])).toHaveLength(5);
        expect(questionsOf(snapshot, ['gone', 'q2']).map((q) => q.id)).toEqual(['q2']);
    });

    it('withoutAnswer has no answer key at all, withAnswer has it', () => {
        expect(Object.keys(withoutAnswer(snapshot.questions[0])).sort()).toEqual(['id', 'options', 'question']);
        expect(withAnswer(snapshot.questions[0]).answer).toBe('A');
    });

    it('grades with the snapshot answer letters, whatever the live quiz says now', () => {
        const questions = questionsOf(snapshot, ['q1', 'q2', 'q3']);
        expect(countCorrect(questions, { q1: 'A', q2: 'B', q3: 'C' })).toBe(3);
        expect(countCorrect(questions, { q1: 'B', q2: 'B' })).toBe(1);
        expect(countCorrect(questions, {})).toBe(0);
        // an answer for a question outside the attempt does not count
        expect(countCorrect(questions, { q4: 'D' })).toBe(0);
    });
});

describe('labelStats', () => {
    it('counts per label in order, unlabeled apart', () => {
        expect(labelStats(snapshot)).toEqual({
            totalQuestions: 5,
            labels: [
                { id: 'la', name: 'Chapter A', color: '#ff0000', questionCount: 3 },
                { id: 'lb', name: 'Chapter B', color: null, questionCount: 1 },
            ],
            unlabeledCount: 1,
        });
    });
});

describe('validateSelectionConfig', () => {
    const run = (mode: number, questionCount: number | null, labelConfig: Array<{ labelId: string; count: number }> | null) =>
        () => validateSelectionConfig(snapshot, { mode, questionCount, labelConfig });

    it('accepts ALL and a drawable config', () => {
        expect(run(QUESTION_SELECTION_MODE.ALL, null, null)).not.toThrow();
        expect(run(QUESTION_SELECTION_MODE.RANDOM_TOTAL, 5, null)).not.toThrow();
        expect(run(QUESTION_SELECTION_MODE.RANDOM_BY_LABEL, 3, [{ labelId: 'la', count: 2 }, { labelId: 'lb', count: 1 }])).not.toThrow();
    });

    it.each([
        ['RANDOM_TOTAL without a count', QUESTION_SELECTION_MODE.RANDOM_TOTAL, null, null],
        ['RANDOM_TOTAL above the total', QUESTION_SELECTION_MODE.RANDOM_TOTAL, 6, null],
        ['RANDOM_BY_LABEL without config', QUESTION_SELECTION_MODE.RANDOM_BY_LABEL, null, null],
        ['an unknown label', QUESTION_SELECTION_MODE.RANDOM_BY_LABEL, null, [{ labelId: 'nope', count: 1 }]],
        ['more than a label holds', QUESTION_SELECTION_MODE.RANDOM_BY_LABEL, null, [{ labelId: 'lb', count: 2 }]],
        ['a label configured twice', QUESTION_SELECTION_MODE.RANDOM_BY_LABEL, null, [{ labelId: 'la', count: 1 }, { labelId: 'la', count: 1 }]],
        ['a total that disagrees with the labels', QUESTION_SELECTION_MODE.RANDOM_BY_LABEL, 4, [{ labelId: 'la', count: 1 }]],
    ])('rejects %s', (_name, mode, count, labels) => {
        expect(run(mode, count, labels)).toThrow();
    });
});
