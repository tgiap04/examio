import { ExamSessionService } from './examsession.service';
import { ExamSessionRepository } from './examsession.repository';
import { ExamRoomRepository } from '../examroom/examroom.repository';
import { ExamRoomService } from '../examroom/examroom.service';

// Room detail embeds examSessions and is cached; every session write must drop it.

const HOST = 'host-1';
const ROOM = 'room-1';
const SESSION = 'session-1';
const user = { id: HOST } as never;

/** In-memory stand-in for RedisService (same get/set/del/delPattern contract). */
class FakeRedis {
    store = new Map<string, string>();
    async get(k: string) {
        const v = this.store.get(k);
        return v ? JSON.parse(v) : null;
    }
    async set(k: string, v: unknown) {
        this.store.set(k, JSON.stringify(v));
    }
    async del(k: string) {
        this.store.delete(k);
    }
    async delPattern(pattern: string) {
        const re = new RegExp(
            '^' +
                pattern
                    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                    .replace(/\*/g, '.*') +
                '$'
        );
        for (const k of [...this.store.keys()]) if (re.test(k)) this.store.delete(k);
    }
}

function build() {
    const db = {
        room: { id: ROOM, hostId: HOST, title: 'R' },
        session: {
            id: SESSION,
            examRoomId: ROOM,
            whitelist: ['old'] as string[],
            accessCode: 'AAAAAA',
            status: 0,
        },
    };
    const sessionWithRoom = () => ({ ...db.session, examRoom: db.room });
    const prisma = {
        examRoom: {
            // Same shape the service asks for: room + nested sessions.
            findFirst: async () => ({
                ...db.room,
                examSessions: [{ ...db.session }],
            }),
        },
        examSession: {
            findUnique: async () => sessionWithRoom(),
            findFirst: async () => sessionWithRoom(),
            update: async ({ data }: { data: Partial<typeof db.session> }) => {
                Object.assign(db.session, data);
                return { ...db.session, assessType: 0 };
            },
            delete: async () => ({ ...db.session }),
        },
    };
    const redis = new FakeRedis();
    const roomRepo = new ExamRoomRepository(prisma as never, redis as never);
    const sessionRepo = new ExamSessionRepository(
        prisma as never,
        redis as never
    );
    const users = {
        withHost: async <T>(r: T) => r,
        withRoomHost: async <T>(s: T) => s,
    };
    const sessions = new ExamSessionService(
        prisma as never,
        sessionRepo,
        roomRepo,
        { generateId: () => 'new' } as never,
        redis as never,
        users as never
    );
    const rooms = new ExamRoomService(
        prisma as never,
        roomRepo,
        {} as never,
        {} as never,
        users as never
    );
    const roomWhitelist = async () =>
        (
            (await rooms.getExamRoomById(ROOM, user)) as unknown as {
                examSessions: { whitelist: string[] }[];
            }
        ).examSessions[0].whitelist;
    return { db, sessions, roomWhitelist };
}

describe('room detail cache vs exam session writes', () => {
    beforeEach(() => jest.spyOn(console, 'log').mockImplementation());
    afterEach(() => jest.restoreAllMocks());

    it('updateExamSession: the next room detail read shows the new whitelist', async () => {
        const { sessions, roomWhitelist } = build();
        expect(await roomWhitelist()).toEqual(['old']); // primes the cache
        await sessions.updateExamSession(SESSION, user, {
            whitelist: ['new'],
        } as never);
        expect(await roomWhitelist()).toEqual(['new']);
    });

    it('updateSharingSettings: the next room detail read shows the new whitelist', async () => {
        const { sessions, roomWhitelist } = build();
        await roomWhitelist();
        await sessions.updateSharingSettings(SESSION, user, {
            isPublic: false,
            whitelist: ['shared'],
        } as never);
        expect(await roomWhitelist()).toEqual(['shared']);
    });

    it('regenerateAccessCode: the room detail cache is dropped', async () => {
        const { sessions, roomWhitelist, db } = build();
        await roomWhitelist();
        db.session.whitelist = ['changed-elsewhere'];
        await sessions.regenerateAccessCode(SESSION, user);
        expect(await roomWhitelist()).toEqual(['changed-elsewhere']);
    });

    it('deleteExamSession: the room detail cache is dropped', async () => {
        const { sessions, roomWhitelist, db } = build();
        await roomWhitelist();
        db.session.whitelist = ['after-delete'];
        await sessions.deleteExamSession(SESSION, user);
        expect(await roomWhitelist()).toEqual(['after-delete']);
    });

    it('a failing cache invalidation does not fail the write', async () => {
        const { sessions } = build();
        jest.spyOn(
            ExamRoomRepository.prototype,
            'invalidateItemCache'
        ).mockRejectedValue(new Error('redis down'));
        jest.spyOn(console, 'warn').mockImplementation();
        await expect(
            sessions.updateSharingSettings(SESSION, user, {
                isPublic: false,
                whitelist: ['x'],
            } as never)
        ).resolves.toMatchObject({ whitelist: ['x'] });
    });
});
