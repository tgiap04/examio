import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { buildSnapshot } from './snapshot.fixture';
import { SnapshotStore } from './snapshot.store';

function store(findUnique: jest.Mock) {
    return new SnapshotStore({ examSession: { findUnique } } as never);
}

describe('SnapshotStore.load', () => {
    it('reads the column once per (session, hash): the second load is served from the cache', async () => {
        const findUnique = jest.fn().mockResolvedValue({ quizSnapshot: buildSnapshot(), quizSnapshotHash: 'h1' });
        const s = store(findUnique);
        await s.load('s1', 'h1');
        await s.load('s1', 'h1');
        expect(findUnique).toHaveBeenCalledTimes(1);
        expect(findUnique.mock.calls[0][0].select).toEqual({ quizSnapshot: true, quizSnapshotHash: true });
    });

    it('a new hash (after a refresh) is read again and never gets the old snapshot', async () => {
        const findUnique = jest
            .fn()
            .mockResolvedValueOnce({ quizSnapshot: buildSnapshot({ title: 'old' }), quizSnapshotHash: 'h1' })
            .mockResolvedValueOnce({ quizSnapshot: buildSnapshot({ title: 'new' }), quizSnapshotHash: 'h2' });
        const s = store(findUnique);
        expect((await s.load('s1', 'h1')).title).toBe('old');
        expect((await s.load('s1', 'h2')).title).toBe('new');
        expect(findUnique).toHaveBeenCalledTimes(2);
    });

    it('uses the client it is given (the transaction under the row lock)', async () => {
        const own = jest.fn();
        const tx = jest.fn().mockResolvedValue({ quizSnapshot: buildSnapshot(), quizSnapshotHash: 'h1' });
        await store(own).load('s1', 'h1', { examSession: { findUnique: tx } } as never);
        expect(own).not.toHaveBeenCalled();
        expect(tx).toHaveBeenCalledTimes(1);
    });

    it('404 for a missing session, 500 for a malformed stored snapshot (never served)', async () => {
        await expect(store(jest.fn().mockResolvedValue(null)).load('s1', 'h1')).rejects.toBeInstanceOf(NotFoundException);
        const bad = jest.fn().mockResolvedValue({ quizSnapshot: { v: 3 }, quizSnapshotHash: 'h1' });
        await expect(store(bad).load('s1', 'h1')).rejects.toBeInstanceOf(InternalServerErrorException);
    });
});
