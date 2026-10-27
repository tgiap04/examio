import {
    bootAssessmentApp,
    type AssessmentTestApp,
    type TestUser,
} from './support/assessment-test-app';
import { call } from './support/http';
import { seedExamRoom, seedQuizSet } from './support/seed';

/** Malformed input must be a 400 from the Zod pipe, never a 500 from Prisma; valid input is unchanged. */
describe('request validation (e2e)', () => {
    let t: AssessmentTestApp;
    let teacher: TestUser;
    let student: TestUser;
    let roomId: string;
    const tok: Record<string, string> = {};

    beforeAll(async () => {
        t = await bootAssessmentApp();
        teacher = await t.createUser(['TEACHER']);
        student = await t.createUser(['STUDENT']);
        tok.teacher = await t.tokenFor(teacher);
        tok.student = await t.tokenFor(student);
        // a room over a real quiz set (one question) in content: session creation takes its snapshot
        roomId = (await seedExamRoom(t, teacher.id, (await seedQuizSet(t, teacher.id)).id)).id;
    });
    afterAll(() => t.close());

    const bad: Array<
        [string, 'post' | 'put', () => string, 'teacher' | 'student', object]
    > = [
        [
            'POST /examattempts/start {}',
            'post',
            () => '/examattempts/start',
            'student',
            {},
        ],
        ['POST /examattempts {}', 'post', () => '/examattempts', 'student', {}],
        [
            'PUT /examattempts/:id/progress bad types',
            'put',
            () => '/examattempts/x/progress',
            'student',
            { currentIndex: 'a', markedQuestions: 5 },
        ],
        [
            'POST /examattempts/:id/secure-submit {}',
            'post',
            () => '/examattempts/x/secure-submit',
            'student',
            {},
        ],
        ['POST /cheatinglogs {}', 'post', () => '/cheatinglogs', 'student', {}],
        ['POST /examrooms {}', 'post', () => '/examrooms', 'teacher', {}],
        ['POST /examsessions {}', 'post', () => '/examsessions', 'teacher', {}],
        [
            'POST /examsessions with an over-long whitelist id',
            'post',
            () => '/examsessions',
            'teacher',
            { examRoomId: 'r', startTime: '2030-01-01T00:00:00.000Z', whitelist: ['x'.repeat(65)] },
        ],
    ];

    it.each(bad)(
        '%s -> 400',
        async (_n, method, path, who, body) => {
            const res = await call(t.server, method, path(), tok[who], body);
            expect(res.status).toBe(400);
        }
    );

    it.each([
        ['/examattempts/list?page=abc', 'student'],
        ['/examattempts/list?limit=0', 'student'],
        ['/examsessions/list?status=zz', 'teacher'],
        ['/student/recent-exams?limit=abc', 'student'],
        ['ROOMSESSIONS', 'teacher'],
        [`/examattempts/list-by-session/x?page=abc`, 'teacher'],
    ] as const)('malformed query %s -> 400', async (path, who) => {
        const p =
            path === 'ROOMSESSIONS'
                ? `/examrooms/${roomId}/sessions?page=abc`
                : path;
        expect((await call(t.server, 'get', p, tok[who])).status).toBe(400);
    });

    it('valid requests are unchanged', async () => {
        const checks: Array<Promise<{ status: number }>> = [
            call(t.server, 'get', '/examattempts/list?page=1&limit=10', tok.student),
            call(t.server, 'get', '/examsessions/list?page=1&status=1', tok.teacher),
            call(t.server, 'get', '/student/recent-exams?limit=5&page=1', tok.student),
            call(t.server, 'get', `/examrooms/${roomId}/sessions?page=1&limit=5`, tok.teacher),
        ];
        for (const r of await Promise.all(checks)) expect(r.status).toBe(200);
    });

    describe('exam session question selection (validateSelectionConfig against the snapshot)', () => {
        const session = (extra: object) =>
            call(t.server, 'post', '/examsessions', tok.teacher, {
                examRoomId: roomId,
                startTime: new Date(Date.now() + 3_600_000).toISOString(),
                ...extra,
            });

        it('RANDOM_TOTAL asking for more questions than the quiz has -> 400 with the reason, not 500', async () => {
            const res = await session({
                questionSelectionMode: 1,
                questionCount: 5,
            });
            expect(res.status).toBe(400);
            expect(JSON.stringify(res.body)).toMatch(/\S/);
            expect(res.body.message).not.toBe('Tạo phiên thi thất bại');
        });

        it('RANDOM_BY_LABEL with an unknown label or too many questions -> 400', async () => {
            const res = await session({
                questionSelectionMode: 2,
                labelQuestionConfig: [{ labelId: 'nope', count: 1 }],
            });
            expect(res.status).toBe(400);
            expect(res.body.message).not.toBe('Tạo phiên thi thất bại');
        });

        it('valid configs -> 201 (ALL, and RANDOM_TOTAL within the quiz size)', async () => {
            expect((await session({})).status).toBe(201);
            expect(
                (await session({ questionSelectionMode: 1, questionCount: 1 }))
                    .status
            ).toBe(201);
        });

        it('a room that is not yours stays 404 (known errors pass through)', async () => {
            const other = await t.createUser(['TEACHER']);
            const res = await call(
                t.server,
                'post',
                '/examsessions',
                await t.tokenFor(other),
                {
                    examRoomId: roomId,
                    startTime: new Date().toISOString(),
                }
            );
            expect(res.status).toBe(404);
        });
    });
});
