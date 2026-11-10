import {
    bootContentApp,
    rid,
    type ContentTestApp,
    type TestUser,
} from './support/content-test-app';
import { call } from './support/http';

describe('ai uploads ownership (e2e)', () => {
    let t: ContentTestApp;
    let owner: TestUser;
    let otherTeacher: TestUser;
    let student: TestUser;
    let adminOnly: TestUser;
    let uploadId: string;
    const tok: Record<string, string> = {};

    beforeAll(async () => {
        t = await bootContentApp();
        owner = await t.createUser(['TEACHER']);
        otherTeacher = await t.createUser(['TEACHER']);
        student = await t.createUser(['STUDENT']);
        adminOnly = await t.createUser(['SYSTEM_ADMIN']);
        for (const [k, u] of Object.entries({
            owner,
            otherTeacher,
            student,
            adminOnly,
        }))
            tok[k] = await t.tokenFor(u);
        // The upload lives in document-service now: owner-scoped, a foreign id is simply absent.
        uploadId = t.document.add(owner.id, { filename: 'a.pdf' }).id;
    });
    afterAll(() => t.close());

    it.each([
        ['GET', 'get', () => `/ai/job/${uploadId}`],
        ['GET', 'get', () => `/ai/upload/${uploadId}/history`],
    ] as const)(
        '%s upload job/history: owner 200, other TEACHER 404, STUDENT and ADMIN-only 403, anonymous 401 (%#)',
        async (_label, method, path) => {
            expect(
                (await call(t.server, method, path(), tok.owner)).status
            ).toBe(200);
            expect(
                (await call(t.server, method, path(), tok.otherTeacher)).status
            ).toBe(404);
            expect(
                (await call(t.server, method, path(), tok.student)).status
            ).toBe(403);
            expect(
                (await call(t.server, method, path(), tok.adminOnly)).status
            ).toBe(403);
            expect((await call(t.server, method, path())).status).toBe(401);
        }
    );

    it('DELETE /ai/job/:id and POST /ai/regenerate/:id: other TEACHER 404 and STUDENT 403, nothing is queued', async () => {
        const job = `nojob_${rid()}`;
        expect(
            (await call(t.server, 'delete', `/ai/job/${job}`, tok.otherTeacher)).status
        ).toBe(404);
        expect((await call(t.server, 'delete', `/ai/job/${job}`, tok.student)).status).toBe(403);
        expect(
            (await call(t.server, 'post', `/ai/regenerate/${uploadId}`, tok.otherTeacher, {})).status
        ).toBe(404);
        expect(
            (await call(t.server, 'post', `/ai/regenerate/${uploadId}`, tok.student, {})).status
        ).toBe(403);
        expect(await t.prisma.generationJob.count({ where: { userId: { in: [otherTeacher.id, student.id] } } })).toBe(0);
    });

    it('AI tool routes are TEACHER-only: STUDENT gets 403 on generate/models/upload', async () => {
        expect(
            (await call(t.server, 'get', '/ai/models', tok.student)).status
        ).toBe(403);
        expect(
            (
                await call(
                    t.server,
                    'post',
                    '/ai/generate-from-file',
                    tok.student,
                    {}
                )
            ).status
        ).toBe(403);
        expect(
            (await call(t.server, 'get', '/ai/recent-uploads', tok.student))
                .status
        ).toBe(403);
        expect(
            (await call(t.server, 'get', '/ai/models', tok.owner)).status
        ).toBe(200);
    });
});
