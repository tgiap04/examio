import { Metadata, status } from '@grpc/grpc-js';
import type { contentV1 } from '@examio/contracts';
import { SnapshotTaker } from './snapshot-taker';

const md = new Metadata();
const message: contentV1.QuizSetSnapshot = {
    schemaVersion: 1, quizSetId: 'qs1', title: 'T', ownerId: 'o', takenAt: 'now', contentHash: 'h',
    labels: [], questions: [{ id: 'q1', question: 'x', options: ['a'], answer: 'A', labelId: undefined, order: 0 }],
};

const codeOf = async (p: Promise<unknown>) => {
    try {
        await p;
    } catch (e) {
        const err = e as { getStatus(): number; getResponse(): { code: string } };
        return `${err.getStatus()} ${err.getResponse().code}`;
    }
    return 'ok';
};

describe('SnapshotTaker.take', () => {
    it('returns the stored shape', async () => {
        const taker = new SnapshotTaker({ getQuizSetSnapshot: jest.fn().mockResolvedValue(message) } as never);
        const snapshot = await taker.take('qs1', md);
        expect(snapshot.contentHash).toBe('h');
        expect(snapshot.questions[0].labelId).toBeNull();
    });

    it.each([
        [status.NOT_FOUND, '422 QUIZSET_DELETED'],
        [status.RESOURCE_EXHAUSTED, '422 QUIZSET_TOO_LARGE'],
        [status.UNAVAILABLE, '503 CONTENT_UNAVAILABLE'],
        [status.DEADLINE_EXCEEDED, '503 CONTENT_UNAVAILABLE'],
        [status.PERMISSION_DENIED, '403 PERMISSION_DENIED'],
    ])('maps gRPC %i to %s', async (code, expected) => {
        const taker = new SnapshotTaker({ getQuizSetSnapshot: jest.fn().mockRejectedValue({ code }) } as never);
        expect(await codeOf(taker.take('qs1', md))).toBe(expected);
    });
});
