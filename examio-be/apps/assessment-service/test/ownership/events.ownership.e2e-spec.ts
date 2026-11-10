import { RedisService } from '@examio/redis';
import { bootAssessmentApp, rid, type AssessmentTestApp } from './support/assessment-test-app';
import { connectPublisher, eventually, type TestPublisher } from './support/broker';
import { call } from './support/http';
import { seedExamRoom } from './support/seed';
import { teacher as makeTeacher, type TokenUser } from './support/users';

/** The two events assessment consumes on `assessment.events`, delivered by the real broker. */
describe('assessment.events consumers (e2e)', () => {
    let t: AssessmentTestApp;
    let owner: TokenUser;
    let content: TestPublisher;
    let auth: TestPublisher;
    const flagged = async (roomId: string) => (await t.prisma.examRoom.findUniqueOrThrow({ where: { id: roomId } })).sourceDeleted;
    const quiet = () => new Promise((resolve) => setTimeout(resolve, 1500));

    beforeAll(async () => {
        t = await bootAssessmentApp();
        owner = await makeTeacher(t);
        content = await connectPublisher(process.env.RABBITMQ_CONTENT_URL as string);
        auth = await connectPublisher(process.env.RABBITMQ_AUTH_URL as string);
    });
    afterAll(async () => {
        await content?.close();
        await auth?.close();
        await t?.close();
    });

    describe('content.quizset.deleted', () => {
        it('flags exactly the owner\'s rooms on those sets, drops their caches, and a replay changes nothing', async () => {
            const roomA = await seedExamRoom(t, owner.id, `qs_${rid()}`);
            const roomB = await seedExamRoom(t, owner.id, `qs_${rid()}`);
            const untouched = await seedExamRoom(t, owner.id, `qs_${rid()}`);
            const stranger = await makeTeacher(t);
            const strangerRoom = await seedExamRoom(t, stranger.id, roomA.quizSetId); // same id, another host
            const redis = t.app.get(RedisService);
            await redis.set(`assessment:cache:quizset:${roomA.quizSetId}`, 'cached title', 300);
            // prime the cached room detail: it must not keep serving `sourceDeleted: false`
            expect((await call(t.server, 'get', `/examrooms/detail/${roomA.id}`, owner.token)).body.sourceDeleted).toBe(false);

            const event = { quizSetIds: [roomA.quizSetId, roomB.quizSetId, 'qs_without_rooms'], ownerId: owner.id };
            await content.publish('content.quizset.deleted', event);
            await eventually(() => flagged(roomA.id));
            await eventually(() => flagged(roomB.id));
            expect(await flagged(untouched.id)).toBe(false);
            expect(await flagged(strangerRoom.id)).toBe(false);
            expect(await redis.get(`assessment:cache:quizset:${roomA.quizSetId}`)).toBeNull();
            expect((await call(t.server, 'get', `/examrooms/detail/${roomA.id}`, owner.token)).body.sourceDeleted).toBe(true);

            // replayed (at-least-once delivery): still flagged, no error, nothing else moves
            await content.publish('content.quizset.deleted', event);
            await quiet();
            expect(await flagged(roomA.id)).toBe(true);
            expect(await flagged(untouched.id)).toBe(false);
        });

        it('a malformed payload is dropped without touching any room', async () => {
            const room = await seedExamRoom(t, owner.id, `qs_${rid()}`);
            await content.publish('content.quizset.deleted', { quizSetIds: room.quizSetId, ownerId: owner.id });
            await quiet();
            expect(await flagged(room.id)).toBe(false);
        });
    });

    describe('auth.user.updated', () => {
        it('deletes the cached public profile of that user only (prefix assessment:cache:user:)', async () => {
            const redis = t.app.get(RedisService);
            const changed = `u_${rid()}`;
            const untouched = `u_${rid()}`;
            await redis.set(`assessment:cache:user:${changed}`, { id: changed }, 300);
            await redis.set(`assessment:cache:user:${untouched}`, { id: untouched }, 300);
            await auth.publish('auth.user.updated', { userId: changed, version: 1 });
            await eventually(async () => (await redis.get(`assessment:cache:user:${changed}`)) === null);
            expect(await redis.get(`assessment:cache:user:${untouched}`)).not.toBeNull();
        });

        it('a malformed payload leaves the cache alone; there is no auth.user.deleted handler', async () => {
            const redis = t.app.get(RedisService);
            const id = `u_${rid()}`;
            await redis.set(`assessment:cache:user:${id}`, { id }, 300);
            await auth.publish('auth.user.updated', { notUserId: id, version: 1 });
            await quiet();
            expect(await redis.get(`assessment:cache:user:${id}`)).not.toBeNull();
        });
    });
});
