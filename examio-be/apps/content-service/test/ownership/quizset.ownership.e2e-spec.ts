import {
    bootContentApp,
    type ContentTestApp,
    type TestUser,
} from './support/content-test-app';
import { call } from './support/http';
import { seedQuizSet } from './support/seed';

describe('quizset ownership (e2e)', () => {
    let t: ContentTestApp;
    let owner: TestUser;
    let otherTeacher: TestUser;
    let student: TestUser;
    let quizId: string;
    const tok: Record<string, string> = {};

    beforeAll(async () => {
        t = await bootContentApp();
        owner = await t.createUser(['TEACHER']);
        otherTeacher = await t.createUser(['TEACHER']);
        student = await t.createUser(['STUDENT']);
        for (const [k, u] of Object.entries({ owner, otherTeacher, student }))
            tok[k] = await t.tokenFor(u);
        quizId = (await seedQuizSet(t, owner.id, { isPublic: true })).id;
    });
    afterAll(() => t.close());

    it('GET/PUT /quizsets/:id: owner 200, other TEACHER 404, STUDENT 403, anonymous 401', async () => {
        const p = `/quizsets/${quizId}`;
        expect((await call(t.server, 'get', p, tok.owner)).status).toBe(200);
        expect((await call(t.server, 'get', p, tok.otherTeacher)).status).toBe(
            404
        );
        expect((await call(t.server, 'get', p, tok.student)).status).toBe(403);
        expect((await call(t.server, 'get', p)).status).toBe(401);
        expect(
            (await call(t.server, 'put', p, tok.otherTeacher, { title: 'x' }))
                .status
        ).toBe(404);
        expect(
            (await call(t.server, 'put', p, tok.student, { title: 'x' })).status
        ).toBe(403);
    });

    it('gap 1: GET /quizsets/public/:id is gone (404 for anonymous, student and teacher), even for a public set', async () => {
        for (const token of [undefined, tok.student, tok.owner]) {
            expect(
                (
                    await call(
                        t.server,
                        'get',
                        `/quizsets/public/${quizId}`,
                        token
                    )
                ).status
            ).toBe(404);
        }
    });

    it('POST /quizsets: TEACHER only', async () => {
        expect(
            (
                await call(t.server, 'post', '/quizsets', tok.student, {
                    title: 'x',
                })
            ).status
        ).toBe(403);
    });

});
