import {
    bootExamApp,
    type ExamTestApp,
    type TestUser,
} from './support/exam-test-app';
import { call } from './support/http';
import { seedAttempt, seedExamRoom, seedExamSession } from './support/seed';

/** Spec rule: a resource the caller does not own answers 404 (never 403) on host-only reads and writes. */
describe('host-only examroom/examsession/attempt routes (e2e)', () => {
    let t: ExamTestApp;
    let host: TestUser;
    let other: TestUser;
    let student: TestUser;
    let roomId: string;
    let sessionId: string;
    let attemptId: string;
    const tok: Record<string, string> = {};

    beforeAll(async () => {
        t = await bootExamApp();
        host = await t.createUser(['TEACHER']);
        other = await t.createUser(['TEACHER']);
        student = await t.createUser(['STUDENT']);
        for (const [k, u] of Object.entries({ host, other, student }))
            tok[k] = await t.tokenFor(u);
        roomId = (await seedExamRoom(t, host.id)).id;
        sessionId = await seedExamSession(t, roomId, { assessType: 0 });
        attemptId = await seedAttempt(t, sessionId, student.id);
    });
    afterAll(() => t.close());

    it.each([
        ['put', () => `/examrooms/${roomId}`, { title: 'x' }],
        ['delete', () => `/examrooms/${roomId}`, undefined],
        ['get', () => `/examrooms/${roomId}/sessions`, undefined],
        ['get', () => `/examsessions/get-by-id/${sessionId}`, undefined],
        ['put', () => `/examsessions/${sessionId}`, {}],
        ['delete', () => `/examsessions/${sessionId}`, undefined],
        ['get', () => `/examsessions/${sessionId}/sharing`, undefined],
        ['put', () => `/examsessions/${sessionId}/sharing`, { isPublic: true }],
        ['post', () => `/examsessions/${sessionId}/generate-code`, undefined],
        [
            'get',
            () => `/examsessions/room/${roomId}/available-labels`,
            undefined,
        ],
        [
            'post',
            () => '/examsessions',
            { examRoomId: 'PLACEHOLDER', startTime: new Date().toISOString() },
        ],
        ['get', () => `/examattempts/list-by-room/${roomId}`, undefined],
        ['get', () => `/examattempts/list-by-session/${sessionId}`, undefined],
        ['delete', () => `/examattempts/${attemptId}`, undefined],
        ['get', () => `/cheatinglogs/attempt/${attemptId}`, undefined],
        ['get', () => `/cheatinglogs/session/${sessionId}/stats`, undefined],
        [
            'get',
            () => `/cheatinglogs/session/${sessionId}/user/${student.id}`,
            undefined,
        ],
    ] as const)(
        '%s (case %#): non-host TEACHER -> 404, STUDENT -> 403',
        async (method, path, body) => {
            const p = path();
            const b =
                body && 'examRoomId' in body
                    ? { ...body, examRoomId: roomId }
                    : body;
            expect((await call(t.server, method, p, tok.other, b)).status).toBe(
                404
            );
            expect(
                (await call(t.server, method, p, tok.student, b)).status
            ).toBe(403);
        }
    );

    it('the owner sharing view lists whitelisted users without emails', async () => {
        const wl = await seedExamSession(t, roomId, {
            assessType: 1,
            whitelist: [student.id],
        });
        const res = await call(
            t.server,
            'get',
            `/examsessions/${wl}/sharing`,
            tok.host
        );
        expect(res.status).toBe(200);
        expect(res.body.whitelist).toEqual([
            {
                id: student.id,
                username: student.id,
                name: `Name ${student.id}`,
                avatar: null,
            },
        ]);

        const fsId = `fs_${Math.random().toString(36).slice(2, 10)}`;
        await t.prisma.flashCardSet.create({
            data: {
                id: fsId,
                title: 't',
                userId: host.id,
                whitelist: [student.id],
            },
        });
        const fs = await call(
            t.server,
            'get',
            `/flashcardsets/${fsId}/sharing`,
            tok.host
        );
        expect(fs.status).toBe(200);
        expect(fs.body.whitelist).toEqual([
            {
                id: student.id,
                username: student.id,
                name: `Name ${student.id}`,
                avatar: null,
            },
        ]);
    });

    it('the host still reaches their own resources (200/2xx)', async () => {
        expect(
            (
                await call(
                    t.server,
                    'get',
                    `/examsessions/get-by-id/${sessionId}`,
                    tok.host
                )
            ).status
        ).toBe(200);
        expect(
            (
                await call(t.server, 'put', `/examrooms/${roomId}`, tok.host, {
                    title: 'renamed',
                })
            ).status
        ).toBe(200);
        expect(
            (
                await call(
                    t.server,
                    'get',
                    `/examattempts/list-by-session/${sessionId}`,
                    tok.host
                )
            ).status
        ).toBe(200);
    });
});
