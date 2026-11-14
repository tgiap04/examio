import {
    bootStudyRoomApp,
    rid,
    type StudyRoomTestApp,
} from './support/study-room-test-app';
import { call } from './support/http';

/**
 * HTTP authorization of the study-room routes with the real guards (RBAC
 * catalog), real Postgres and Redis. Room-level checks are membership based
 * (`assertRole`): a non-member or non-host gets 403, and so does an id that does
 * not exist, so a room id is never an existence oracle.
 */
describe('study-room permissions (e2e)', () => {
    let t: StudyRoomTestApp;
    const tok = {} as Record<'student' | 'teacher' | 'otherTeacher' | 'admin', string>;
    let roomId: string;

    beforeAll(async () => {
        t = await bootStudyRoomApp();
        tok.student = await t.tokenFor(await t.createUser(['STUDENT']));
        tok.teacher = await t.tokenFor(await t.createUser(['TEACHER']));
        tok.otherTeacher = await t.tokenFor(await t.createUser(['TEACHER']));
        tok.admin = await t.tokenFor(await t.createUser(['SYSTEM_ADMIN']));
        const created = await call(t.server, 'post', '/studyrooms', tok.teacher, {
            name: `perm room ${rid()}`,
        });
        expect(created.status).toBe(201);
        roomId = created.body.id;
    });

    afterAll(async () => {
        await t.close();
    });

    it('POST /studyrooms: STUDENT 403, TEACHER 201, SYSTEM_ADMIN-only 403, anonymous 401', async () => {
        const body = { name: `r ${rid()}` };
        expect((await call(t.server, 'post', '/studyrooms', tok.student, body)).status).toBe(403);
        expect((await call(t.server, 'post', '/studyrooms', tok.teacher, body)).status).toBe(201);
        expect((await call(t.server, 'post', '/studyrooms', tok.admin, body)).status).toBe(403);
        expect((await call(t.server, 'post', '/studyrooms', undefined, body)).status).toBe(401);
    });

    it('PUT /studyrooms/:id: the host 200, another TEACHER (not a member) 403, a STUDENT 403', async () => {
        const body = { description: 'updated' };
        expect((await call(t.server, 'put', `/studyrooms/${roomId}`, tok.teacher, body)).status).toBe(200);
        expect((await call(t.server, 'put', `/studyrooms/${roomId}`, tok.otherTeacher, body)).status).toBe(403);
        expect((await call(t.server, 'put', `/studyrooms/${roomId}`, tok.student, body)).status).toBe(403);
    });

    it('DELETE and regenerate-code are host-only: another TEACHER gets 403 and the room survives', async () => {
        expect((await call(t.server, 'delete', `/studyrooms/${roomId}`, tok.otherTeacher)).status).toBe(403);
        expect((await call(t.server, 'post', `/studyrooms/${roomId}/regenerate-code`, tok.otherTeacher, {})).status).toBe(403);
        const stillThere = await t.prisma.studyRoom.findUnique({ where: { id: roomId } });
        expect(stillThere?.id).toBe(roomId);
    });

    it('join and read routes accept STUDENT and TEACHER, refuse a SYSTEM_ADMIN-only token', async () => {
        expect((await call(t.server, 'post', `/studyrooms/${roomId}/join`, tok.student, {})).status).toBe(201);
        expect((await call(t.server, 'get', `/studyrooms/${roomId}`, tok.student)).status).toBe(200);
        expect((await call(t.server, 'get', '/studyrooms/mine', tok.student)).status).toBe(200);
        expect((await call(t.server, 'get', '/studyrooms/mine', tok.admin)).status).toBe(403);
        expect((await call(t.server, 'post', `/studyrooms/${roomId}/join`, tok.admin, {})).status).toBe(403);
    });

    it('a non-member cannot read a room, and an unknown id answers the same 403 (no existence oracle)', async () => {
        const real = await call(t.server, 'get', `/studyrooms/${roomId}`, tok.otherTeacher);
        const unknown = await call(t.server, 'get', '/studyrooms/does-not-exist', tok.otherTeacher);
        expect([real.status, unknown.status]).toEqual([403, 403]);
        expect(real.body.message).toBe(unknown.body.message);
    });

    describe('input validation (moved from the exam ownership suite)', () => {
        it.each([
            ['POST /studyrooms {}', 'post', () => '/studyrooms', 'teacher'],
            ['POST /studyrooms/join {}', 'post', () => '/studyrooms/join', 'student'],
        ] as const)('%s -> 400', async (_name, method, path, who) => {
            const res = await call(t.server, method, path(), tok[who], {});
            expect(res.status).toBe(400);
        });

        it('a valid create then join by a student answers 201 both times', async () => {
            const room = await call(t.server, 'post', '/studyrooms', tok.teacher, {
                name: 'valid room',
            });
            expect(room.status).toBe(201);
            const join = await call(t.server, 'post', `/studyrooms/${room.body.id}/join`, tok.student, {});
            expect(join.status).toBe(201);
        });
    });
});
