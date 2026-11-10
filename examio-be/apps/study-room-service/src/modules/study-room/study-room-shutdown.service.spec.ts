import { StudyRoomShutdown } from './study-room-shutdown.service';

describe('StudyRoomShutdown', () => {
    it('flushes buffered focus time through the gateway on module destroy', async () => {
        const gateway = { drainFocus: jest.fn().mockResolvedValue(undefined) };
        await new StudyRoomShutdown(gateway as never).onModuleDestroy();
        expect(gateway.drainFocus).toHaveBeenCalledTimes(1);
    });

    it('never throws out of the destroy hook (the gateway drain swallows Redis/DB failures)', async () => {
        const state = {
            pendingFocusEntries: jest.fn().mockRejectedValue(new Error('redis down')),
        };
        const { StudyRoomGateway } = await import('./study-room.gateway');
        const gateway = new StudyRoomGateway(
            {} as never,
            {} as never,
            {} as never,
            state as never,
            { setServer: jest.fn() } as never,
            {} as never
        );
        await expect(new StudyRoomShutdown(gateway).onModuleDestroy()).resolves.toBeUndefined();
        expect(state.pendingFocusEntries).toHaveBeenCalledTimes(1);
    });
});
