import {
    bootAssessmentApp,
    type AssessmentTestApp,
    type TestUser,
} from './support/assessment-test-app';
import { call } from './support/http';
import { seedExamRoom, seedExamSession } from './support/seed';

/** Real Redis: a write must be visible to the very next read (no 5 minute stale cache). */
describe('read-after-write cache coherence (e2e)', () => {
    let t: AssessmentTestApp;
    let teacher: TestUser;
    let tok: string;

    beforeAll(async () => {
        t = await bootAssessmentApp();
        teacher = await t.createUser(['TEACHER']);
        tok = await t.tokenFor(teacher);
    });
    afterAll(() => t.close());

    it('exam room and exam session: PUT is visible to the next detail / get-by-id', async () => {
        const room = await seedExamRoom(t, teacher.id);
        expect(
            (await call(t.server, 'get', `/examrooms/detail/${room.id}`, tok))
                .body.title
        ).toBeDefined();
        expect(
            (
                await call(t.server, 'put', `/examrooms/${room.id}`, tok, {
                    title: 'room after',
                })
            ).status
        ).toBe(200);
        expect(
            (await call(t.server, 'get', `/examrooms/detail/${room.id}`, tok))
                .body.title
        ).toBe('room after');

        const session = await seedExamSession(t, room.id, { assessType: 0 });
        expect(
            (
                await call(
                    t.server,
                    'get',
                    `/examsessions/get-by-id/${session}`,
                    tok
                )
            ).body.maxAttempts
        ).toBe(1);
        expect(
            (
                await call(t.server, 'put', `/examsessions/${session}`, tok, {
                    maxAttempts: 4,
                })
            ).status
        ).toBe(200);
        expect(
            (
                await call(
                    t.server,
                    'get',
                    `/examsessions/get-by-id/${session}`,
                    tok
                )
            ).body.maxAttempts
        ).toBe(4);
        await call(t.server, 'put', `/examsessions/${session}/sharing`, tok, {
            isPublic: false,
            accessCode: '123456',
        });
        expect(
            (
                await call(
                    t.server,
                    'get',
                    `/examsessions/get-by-id/${session}`,
                    tok
                )
            ).body.assessType
        ).toBe(1);
        expect(
            (await call(t.server, 'delete', `/examsessions/${session}`, tok))
                .status
        ).toBe(200);
        expect(
            (
                await call(
                    t.server,
                    'get',
                    `/examsessions/get-by-id/${session}`,
                    tok
                )
            ).status
        ).toBe(404);
    });
});
