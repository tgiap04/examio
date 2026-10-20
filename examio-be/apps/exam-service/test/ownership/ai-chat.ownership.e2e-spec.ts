import {
    bootExamApp,
    rid,
    type ExamTestApp,
    type TestUser,
} from './support/exam-test-app';
import { call } from './support/http';

describe('ai-chat ownership (e2e)', () => {
    let t: ExamTestApp;
    let owner: TestUser;
    let otherTeacher: TestUser;
    let student: TestUser;
    let adminOnly: TestUser;
    let chatId: string;
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
        chatId = `chat_${rid()}`;
        await t.prisma.aIChat.create({
            data: { id: chatId, userId: owner.id, title: 't' },
        });
    });
    afterAll(() => t.close());

    it('GET /ai-chat/:chatId/messages: owner 200, other TEACHER 404, STUDENT and ADMIN-only 403, anonymous 401', async () => {
        const p = `/ai-chat/${chatId}/messages`;
        expect((await call(t.server, 'get', p, tok.owner)).status).toBe(200);
        expect((await call(t.server, 'get', p, tok.otherTeacher)).status).toBe(
            404
        );
        expect((await call(t.server, 'get', p, tok.student)).status).toBe(403);
        expect((await call(t.server, 'get', p, tok.adminOnly)).status).toBe(
            403
        );
        expect((await call(t.server, 'get', p)).status).toBe(401);
    });

    it('gap 8: GET /ai-chat/:chatId/exists is true only for the owner (another TEACHER sees false, never the existence)', async () => {
        const p = `/ai-chat/${chatId}/exists`;
        expect((await call(t.server, 'get', p, tok.owner)).body).toEqual({
            exists: true,
        });
        expect((await call(t.server, 'get', p, tok.otherTeacher)).body).toEqual(
            { exists: false }
        );
        expect((await call(t.server, 'get', p, tok.student)).status).toBe(403);
        expect((await call(t.server, 'get', p)).status).toBe(401);
    });

    it('POST /ai-chat is TEACHER-only', async () => {
        expect(
            (await call(t.server, 'post', '/ai-chat', tok.student, {})).status
        ).toBe(403);
        expect(
            (await call(t.server, 'post', '/ai-chat', tok.adminOnly, {})).status
        ).toBe(403);
    });
});
