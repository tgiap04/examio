import { StudyRoomGateway } from './study-room.gateway';

// socket.data crosses instances: @socket.io/redis-adapter JSON-serialises it on
// fetchSockets(). A non-serialisable value (a Node Timeout is circular) makes
// the REMOTE instance throw an uncaught TypeError and exit.
describe('StudyRoomGateway socket.data', () => {
    const make = () =>
        new StudyRoomGateway(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            { setServer: jest.fn() } as never,
            {} as never
        );
    const makeSocket = () => ({
        id: 's1',
        data: {
            user: { id: 'u1' },
            av: 1,
            exp: Math.floor(Date.now() / 1000) + 600,
            rooms: new Set<string>(),
        } as Record<string, unknown>,
        join: jest.fn().mockResolvedValue(undefined),
        emit: jest.fn(),
        disconnect: jest.fn(),
    });

    it('keeps socket.data JSON-serialisable after handleConnection', async () => {
        const gateway = make();
        const socket = makeSocket();
        gateway.handleConnection(socket as never);
        expect(() => JSON.stringify(socket.data)).not.toThrow();
        await gateway.handleDisconnect(socket as never);
    });

    it('still disconnects at token expiry and clears the timer on disconnect', async () => {
        jest.useFakeTimers();
        try {
            const gateway = make();
            const expiring = makeSocket();
            expiring.data.exp = Math.floor(Date.now() / 1000) + 1;
            gateway.handleConnection(expiring as never);
            jest.advanceTimersByTime(1500);
            expect(expiring.disconnect).toHaveBeenCalledWith(true);

            const other = makeSocket();
            other.id = 's2';
            gateway.handleConnection(other as never);
            await gateway.handleDisconnect(other as never);
            jest.advanceTimersByTime(10 * 60_000);
            expect(other.disconnect).not.toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });
});
