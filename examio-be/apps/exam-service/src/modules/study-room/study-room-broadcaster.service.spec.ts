import type { Server } from 'socket.io';
import { StudyRoomBroadcaster } from './study-room-broadcaster.service';
import { ServerEvents } from './study-room.events';

function fakeServer(sockets: Array<{ data: { av?: number } }>) {
    const remote = sockets.map((s) => ({
        data: s.data,
        emit: jest.fn(),
        disconnect: jest.fn(),
    }));
    const server = {
        in: jest.fn().mockReturnValue({
            fetchSockets: jest.fn().mockResolvedValue(remote),
        }),
    };
    return { server: server as unknown as Server, remote, inFn: server.in };
}

describe('StudyRoomBroadcaster.reauthStaleSockets', () => {
    it('does nothing before the server is attached', async () => {
        expect(
            await new StudyRoomBroadcaster().reauthStaleSockets('u1', 5)
        ).toBe(0);
    });

    it('asks only the per-user room and disconnects sockets with an older av', async () => {
        const { server, remote, inFn } = fakeServer([
            { data: { av: 1 } },
            { data: { av: 5 } },
            { data: { av: 9 } },
            { data: {} },
        ]);
        const b = new StudyRoomBroadcaster();
        b.setServer(server);
        expect(await b.reauthStaleSockets('u1', 5)).toBe(2);
        expect(inFn).toHaveBeenCalledWith('user:u1');
        expect(remote[0].emit).toHaveBeenCalledWith(ServerEvents.AUTH_REAUTH, {
            reason: 'AUTHZ_CHANGED',
        });
        expect(remote[0].disconnect).toHaveBeenCalledWith(true);
        expect(remote[3].disconnect).toHaveBeenCalledWith(true);
        expect(remote[1].emit).not.toHaveBeenCalled();
        expect(remote[2].disconnect).not.toHaveBeenCalled();
    });

    it('is idempotent: a second delivery finds nothing stale', async () => {
        const { server } = fakeServer([]);
        const b = new StudyRoomBroadcaster();
        b.setServer(server);
        expect(await b.reauthStaleSockets('u1', 5)).toBe(0);
        expect(await b.reauthStaleSockets('u1', 5)).toBe(0);
    });
});
