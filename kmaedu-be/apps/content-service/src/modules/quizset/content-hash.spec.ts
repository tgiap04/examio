import { computeContentHash, type HashLabel, type HashQuestion } from './content-hash';

const labels = (): HashLabel[] => [
    { id: 'l2', name: 'Part B', order: 1, color: null },
    { id: 'l1', name: 'Part A', order: 0, color: '#336699' },
];
const questions = (): HashQuestion[] =>
    Array.from({ length: 5 }, (_, i) => ({
        id: `q${i}`,
        question: `Question ${i}?`,
        options: ['a', 'b', 'c', 'd'],
        answer: 'A',
        labelId: i < 3 ? 'l1' : 'l2',
        order: i,
    }));

describe('computeContentHash', () => {
    it('is a stable sha256 hex of 2 labels / 5 questions, whatever the order the labels arrive in', () => {
        const hash = computeContentHash(labels(), questions());
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
        expect(computeContentHash(labels().reverse(), questions())).toBe(hash);
        expect(computeContentHash(labels(), questions())).toBe(hash);
    });

    it.each<[string, (q: HashQuestion[], l: HashLabel[]) => void]>([
        ['question text', (q) => (q[2].question = 'Edited?')],
        ['an option', (q) => (q[0].options[1] = 'changed')],
        ['the answer key', (q) => (q[4].answer = 'B')],
        ['the label of a question', (q) => (q[0].labelId = 'l2')],
        ['the question order', (q) => q.reverse().forEach((x, i) => (x.order = i))],
        ['a removed question', (q) => q.pop()],
        ['a label name', (_q, l) => (l[0].name = 'Renamed')],
        ['a label colour', (_q, l) => (l[1].color = '#000000')],
    ])('changes when %s changes', (_name, mutate) => {
        const q = questions();
        const l = labels();
        const before = computeContentHash(l, q);
        mutate(q, l);
        expect(computeContentHash(l, q)).not.toBe(before);
    });

    it('treats an absent colour and a null colour alike', () => {
        const withNull = labels();
        const withUndefined = labels().map((l) => ({ ...l, color: l.color ?? (undefined as unknown as null) }));
        expect(computeContentHash(withUndefined, questions())).toBe(computeContentHash(withNull, questions()));
    });
});
