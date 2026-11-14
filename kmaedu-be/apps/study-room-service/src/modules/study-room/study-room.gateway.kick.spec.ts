import { StudyRoomGateway } from './study-room.gateway';
import { ServerEvents } from './study-room.events';

// fetchSockets() across the redis-adapter rejects when any instance does not
// answer; the kicked user's sockets on THIS instance must still be removed.
describe('StudyRoomGateway kickUser', () => {
    const make = () =>
        new StudyRoomGateway(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            { setServer: jest.fn() } as never,
            {} as never
        );
    const sock = (userId: string) => ({ data: { user: { id: userId } }, emit: jest.fn(), disconnect: jest.fn() });

    it('kicks the user locally when the cluster-wide fetchSockets rejects', async () => {
        const gateway = make();
        const target = sock('u1');
        const other = sock('u2');
        const local = { fetchSockets: jest.fn().mockResolvedValue([target, other]) };
        (gateway as any).server = {
            in: jest.fn(() => ({ fetchSockets: jest.fn().mockRejectedValue(new Error('timeout reached')) })),
            local: { in: jest.fn(() => local) },
        };
        await (gateway as any).kickUser('room1', 'u1');
        expect(target.emit).toHaveBeenCalledWith(ServerEvents.ROOM_KICKED, { roomId: 'room1' });
        expect(target.disconnect).toHaveBeenCalledWith(true);
        expect(other.disconnect).not.toHaveBeenCalled();
    });

    it('uses the cluster-wide result when it succeeds', async () => {
        const gateway = make();
        const target = sock('u1');
        const local = { fetchSockets: jest.fn() };
        (gateway as any).server = {
            in: jest.fn(() => ({ fetchSockets: jest.fn().mockResolvedValue([target]) })),
            local: { in: jest.fn(() => local) },
        };
        await (gateway as any).kickUser('room1', 'u1');
        expect(target.disconnect).toHaveBeenCalledWith(true);
        expect(local.fetchSockets).not.toHaveBeenCalled();
    });
});
