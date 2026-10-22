import { StudyRoomGateway } from './study-room.gateway';

describe('StudyRoomGateway focus sweep', () => {
    afterEach(() => jest.useRealTimers());

    it('does not leak an unhandled rejection when Redis is down during the sweep', async () => {
        jest.useFakeTimers();
        const unhandled: unknown[] = [];
        const onUnhandled = (e: unknown) => unhandled.push(e);
        process.on('unhandledRejection', onUnhandled);

        const state = {
            pendingFocusEntries: jest
                .fn()
                .mockRejectedValue(new Error('MaxRetriesPerRequestError')),
        };
        const broadcaster = { setServer: jest.fn() };
        const gateway = new StudyRoomGateway(
            {} as never,
            {} as never,
            {} as never,
            state as never,
            broadcaster as never,
            {} as never
        );
        gateway.afterInit({ use: jest.fn() } as never);
        await jest.advanceTimersByTimeAsync(5 * 60_000);
        jest.useRealTimers();
        await new Promise((r) => setImmediate(r));
        process.off('unhandledRejection', onUnhandled);
        gateway.onModuleDestroy();

        expect(state.pendingFocusEntries).toHaveBeenCalledTimes(1);
        expect(unhandled).toEqual([]);
    });
});
