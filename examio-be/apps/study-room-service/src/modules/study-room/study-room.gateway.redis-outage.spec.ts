import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { StudyRoomGateway } from './study-room.gateway';
import {
    StudyRoomWsExceptionFilter,
    isRedisUnavailable,
    runSafely,
} from './study-room-redis-safety';
import { ServerEvents } from './study-room.events';

// Port 1 is closed: every command waits for a connection that never comes and
// then rejects with MaxRetriesPerRequestError (the production crash).
const DEAD = { host: '127.0.0.1', port: 1 };

function deadRedis(): Redis {
    const redis = new Redis({
        ...DEAD,
        maxRetriesPerRequest: 1,
        retryStrategy: () => 20,
    });
    redis.on('error', () => undefined);
    return redis;
}

function buildGateway(state: Record<string, unknown>) {
    return new StudyRoomGateway(
        {} as never,
        {} as never,
        {} as never,
        state as never,
        { setServer: jest.fn() } as never,
        {} as never
    );
}

const flush = () => new Promise((r) => setTimeout(r, 300));

describe('StudyRoomGateway during a Redis outage', () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    let redis: Redis;

    beforeEach(() => {
        unhandled.length = 0;
        process.on('unhandledRejection', onUnhandled);
        redis = deadRedis();
    });

    afterEach(() => {
        process.off('unhandledRejection', onUnhandled);
        redis.disconnect();
    });

    it('handleDisconnect (invoked the way Nest/socket.io do, un-awaited) leaks no unhandled rejection', async () => {
        const gateway = buildGateway({
            takeFocus: () => redis.get('focus'),
            clearPresence: () => redis.del('presence'),
        });
        const socket = {
            data: {
                user: { id: 'u1' },
                rooms: new Set(['room-1']),
            },
        };
        // socket.io/Nest: emitter.on('disconnect', instance.handleDisconnect)
        const emitter = new EventEmitter();
        emitter.on('disconnect', gateway.handleDisconnect.bind(gateway));
        emitter.emit('disconnect', socket);
        await flush();
        expect(unhandled).toEqual([]);
    });

    it('handleDisconnect still leaves every room when one room fails', async () => {
        const takeFocus = jest
            .fn()
            .mockRejectedValueOnce(new Error('MaxRetriesPerRequestError'))
            .mockResolvedValue(0);
        const clearPresence = jest.fn().mockResolvedValue(undefined);
        const gateway = buildGateway({
            takeFocus,
            clearPresence,
            getPlaylistCount: jest.fn().mockResolvedValue(0),
        });
        const socket = {
            to: () => ({ emit: jest.fn() }),
            data: { user: { id: 'u1' }, rooms: new Set(['a', 'b']) },
        };
        await expect(gateway.handleDisconnect(socket as never)).resolves.toBeUndefined();
        expect(takeFocus).toHaveBeenCalledTimes(2);
    });
});

describe('runSafely', () => {
    it('logs and resolves instead of rejecting', async () => {
        const logger = { warn: jest.fn() };
        await expect(
            runSafely(logger as never, 'leave room=r1', async () => {
                throw new Error('boom');
            })
        ).resolves.toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('leave room=r1')
        );
    });
});

describe('StudyRoomWsExceptionFilter', () => {
    const hostFor = (client: { emit: jest.Mock }) =>
        ({
            getType: () => 'ws',
            switchToWs: () => ({ getClient: () => client, getData: () => ({}), getPattern: () => 'x' }),
            getArgs: () => [client, {}],
            getArgByIndex: (i: number) => [client, {}][i],
        }) as never;

    it('turns a real MaxRetriesPerRequestError into a SERVICE_UNAVAILABLE socket error', async () => {
        const redis = deadRedis();
        const err = await redis.get('k').catch((e: unknown) => e);
        redis.disconnect();
        expect(isRedisUnavailable(err)).toBe(true);

        const client = { emit: jest.fn() };
        new StudyRoomWsExceptionFilter().catch(err as Error, hostFor(client));
        expect(client.emit).toHaveBeenCalledWith(
            ServerEvents.ERROR,
            expect.objectContaining({ code: 'SERVICE_UNAVAILABLE' })
        );
    });

    it('does not classify ordinary errors as Redis outages', () => {
        expect(isRedisUnavailable(new Error('nope'))).toBe(false);
    });
});
