import {
    bootExamApp,
    rid,
    type ExamTestApp,
    type TestUser,
} from './support/exam-test-app';
import { call } from './support/http';

describe('ai uploads ownership (e2e)', () => {
    let t: ExamTestApp;
    let owner: TestUser;
    let otherTeacher: TestUser;
    let student: TestUser;
    let adminOnly: TestUser;
    let uploadId: string;
    const tok: Record<string, string> = {};

    beforeAll(async () => {
        t = await bootExamApp();
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
        uploadId = `up_${rid()}`;
        await t.prisma.userStorage.create({
            data: {
                id: uploadId,
                userId: owner.id,
                filename: 'a.pdf',
                url: 'https://files.test/a.pdf',
                mimetype: 'application/pdf',
                size: 10,
                keyR2: `k_${uploadId}`,
            },
        });
    });
    afterAll(() => t.close());

    it.each([
        ['GET', 'get', () => `/ai/upload/${uploadId}`],
        ['GET', 'get', () => `/ai/job/${uploadId}`],
    ] as const)(
        '%s upload/job: owner 200, other TEACHER 404, STUDENT and ADMIN-only 403, anonymous 401 (%#)',
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

    it('DELETE /ai/upload/:id: other TEACHER 404 and STUDENT 403 leave the upload in place', async () => {
        const p = `/ai/upload/${uploadId}`;
        expect(
            (await call(t.server, 'delete', p, tok.otherTeacher)).status
        ).toBe(404);
        expect((await call(t.server, 'delete', p, tok.student)).status).toBe(
            403
        );
        expect(
            await t.prisma.userStorage.findUnique({ where: { id: uploadId } })
        ).not.toBeNull();
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
