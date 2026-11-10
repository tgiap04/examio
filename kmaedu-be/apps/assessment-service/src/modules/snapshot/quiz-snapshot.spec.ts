import type { contentV1 } from '@kmaedu/contracts';
import { buildSnapshot } from './snapshot.fixture';
import {
    assertSnapshotWithinCap,
    quizSnapshotSchema,
    snapshotFromContent,
    SNAPSHOT_MAX_BYTES,
} from './quiz-snapshot';

const message: contentV1.QuizSetSnapshot = {
    schemaVersion: 1,
    quizSetId: 'qs1',
    title: 'Algebra',
    ownerId: 'teacher',
    takenAt: '2026-10-25T00:00:00.000Z',
    contentHash: 'hash-1',
    labels: [
        { id: 'la', name: 'A', order: 0, color: '#fff' },
        { id: 'lb', name: 'B', order: 1, color: undefined },
    ],
    questions: [
        { id: 'q2', question: 'second', options: ['x', 'y'], answer: 'B', labelId: undefined, order: 1 },
        { id: 'q1', question: 'first', options: ['x', 'y'], answer: 'A', labelId: 'la', order: 0 },
    ],
};

describe('snapshotFromContent', () => {
    it('maps the RPC message to the stored shape, questions by order, absent label/color normalised', () => {
        const snapshot = snapshotFromContent(message);
        expect(snapshot.v).toBe(1);
        expect(snapshot.contentHash).toBe('hash-1');
        expect(snapshot.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
        expect(snapshot.questions[1].labelId).toBeNull();
        expect(snapshot.labels[1]).not.toHaveProperty('color');
        expect(quizSnapshotSchema.safeParse(snapshot).success).toBe(true);
    });
});

describe('quizSnapshotSchema', () => {
    it('rejects a malformed stored snapshot', () => {
        expect(quizSnapshotSchema.safeParse({ ...buildSnapshot(), v: 2 }).success).toBe(false);
        expect(quizSnapshotSchema.safeParse({ ...buildSnapshot(), questions: [{ id: 'x' }] }).success).toBe(false);
        expect(quizSnapshotSchema.safeParse(null).success).toBe(false);
    });
});

describe('assertSnapshotWithinCap', () => {
    it('lets a normal snapshot through', () => {
        expect(() => assertSnapshotWithinCap(buildSnapshot())).not.toThrow();
    });

    it('refuses one above 1 MB with 422 QUIZSET_TOO_LARGE', () => {
        const big = buildSnapshot({
            questions: [{ id: 'q', question: 'x'.repeat(SNAPSHOT_MAX_BYTES + 10), options: ['a'], answer: 'A', labelId: null, order: 0 }],
        });
        try {
            assertSnapshotWithinCap(big);
            fail('expected QUIZSET_TOO_LARGE');
        } catch (error) {
            const e = error as { getStatus(): number; getResponse(): { code: string } };
            expect(e.getStatus()).toBe(422);
            expect(e.getResponse().code).toBe('QUIZSET_TOO_LARGE');
        }
    });
});
