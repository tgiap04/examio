import { Metadata, status } from '@grpc/grpc-js';
import { SnapshotDrift, canRefresh } from './snapshot-drift';

const md = new Metadata();
const room = { quizSetId: 'qs1', sourceDeleted: false };
const session = (over: Partial<{ status: number; quizSnapshotHash: string; attemptCount: number }> = {}) => ({
    id: 's1',
    status: 0,
    quizSnapshotHash: 'h1',
    attemptCount: 0,
    ...over,
});

function drift(getQuizSetsByIds: jest.Mock) {
    return new SnapshotDrift({ getQuizSetsByIds } as never);
}

describe('SnapshotDrift.annotate', () => {
    it('same hash -> not outdated; different hash -> outdated; ONE call with the content hash requested', async () => {
        const call = jest.fn().mockResolvedValue([{ id: 'qs1', title: 't', contentHash: 'h2' }]);
        const [a, b] = await drift(call).annotate(room, [session(), session({ quizSnapshotHash: 'h2' })], md);
        expect(a.snapshotOutdated).toBe(true);
        expect(b.snapshotOutdated).toBe(false);
        expect(call).toHaveBeenCalledTimes(1);
        expect(call).toHaveBeenCalledWith(['qs1'], md, true);
    });

    it('content UNAVAILABLE -> snapshotOutdated null, no throw', async () => {
        const call = jest.fn().mockRejectedValue({ code: status.UNAVAILABLE });
        const [a] = await drift(call).annotate(room, [session()], md);
        expect(a.snapshotOutdated).toBeNull();
        expect(a.canRefreshSnapshot).toBe(true);
    });

    it('a set content no longer returns is not "outdated"; and a flagged room never calls content', async () => {
        const gone = jest.fn().mockResolvedValue([]);
        expect((await drift(gone).annotate(room, [session()], md))[0].snapshotOutdated).toBe(false);
        const flagged = jest.fn();
        const [a] = await drift(flagged).annotate({ ...room, sourceDeleted: true }, [session()], md);
        expect(flagged).not.toHaveBeenCalled();
        expect(a.canRefreshSnapshot).toBe(false);
    });

    it('no sessions -> no call', async () => {
        const call = jest.fn();
        expect(await drift(call).annotate(room, [], md)).toEqual([]);
        expect(call).not.toHaveBeenCalled();
    });
});

describe('canRefresh', () => {
    it.each([
        [0, 0, false, true],
        [1, 0, false, false],
        [2, 0, false, false],
        [0, 1, false, false],
        [0, 0, true, false],
    ])('status %i, %i attempts, sourceDeleted %s -> %s', (st, attemptCount, sourceDeleted, expected) => {
        expect(canRefresh({ status: st, attemptCount }, sourceDeleted)).toBe(expected);
    });
});
