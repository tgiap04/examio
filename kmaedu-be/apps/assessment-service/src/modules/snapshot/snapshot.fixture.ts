import type { QuizSnapshotV1 } from './quiz-snapshot';

/** 2 labels (A: q1 q2 q3, B: q4) + 1 unlabeled question (q5). Answer letters: q1 A, q2 B, q3 C, q4 D, q5 A. */
export function buildSnapshot(overrides: Partial<QuizSnapshotV1> = {}): QuizSnapshotV1 {
    const letters = ['A', 'B', 'C', 'D', 'A'];
    const labelOf = ['la', 'la', 'la', 'lb', null];
    return {
        v: 1,
        quizSetId: 'qs1',
        title: 'Algebra',
        takenAt: '2026-10-25T00:00:00.000Z',
        contentHash: 'hash-1',
        labels: [
            { id: 'la', name: 'Chapter A', order: 0, color: '#ff0000' },
            { id: 'lb', name: 'Chapter B', order: 1 },
        ],
        questions: letters.map((answer, i) => ({
            id: `q${i + 1}`,
            question: `Question ${i + 1}?`,
            options: ['o1', 'o2', 'o3', 'o4'],
            answer,
            labelId: labelOf[i],
            order: i,
        })),
        ...overrides,
    };
}
