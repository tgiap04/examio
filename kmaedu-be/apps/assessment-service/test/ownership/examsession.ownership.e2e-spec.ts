import {
    bootAssessmentApp,
    type AssessmentTestApp,
    type TestUser,
} from './support/assessment-test-app';
import { call, keysDeep } from './support/http';
import { seedExamRoom, seedExamSession } from './support/seed';

const LEAKY = ['accessCode', 'whitelist', 'answer', 'isCorrect', 'email', 'quizSnapshot'];

describe('examsession ownership (e2e)', () => {
    let t: AssessmentTestApp;
    let host: TestUser;
    let otherTeacher: TestUser;
    let student: TestUser;
    let whitelisted: TestUser;
    let adminOnly: TestUser;
    let roomId: string;
    let privateSession: string;
    let codeSession: string;
    let publicSession: string;
    const CODE = '730194';
    const tok: Record<string, string> = {};

    beforeAll(async () => {
        t = await bootAssessmentApp();
        host = await t.createUser(['TEACHER']);
        otherTeacher = await t.createUser(['TEACHER']);
        student = await t.createUser(['STUDENT']);
        whitelisted = await t.createUser(['STUDENT']);
        adminOnly = await t.createUser(['SYSTEM_ADMIN']);
        for (const [k, u] of Object.entries({
            host,
            otherTeacher,
            student,
            whitelisted,
            adminOnly,
        })) {
            tok[k] = await t.tokenFor(u);
        }
        const room = await seedExamRoom(t, host.id);
        roomId = room.id;
        privateSession = await seedExamSession(t, roomId, {
            assessType: 1,
            whitelist: [whitelisted.id],
        });
        codeSession = await seedExamSession(t, roomId, {
            assessType: 1,
            accessCode: CODE,
            whitelist: [whitelisted.id],
        });
        publicSession = await seedExamSession(t, roomId, { assessType: 0 });
    });
    afterAll(() => t.close());

    const noLeaks = (body: unknown) => {
        const keys = keysDeep(body);
        for (const k of LEAKY) expect(keys.has(k)).toBe(false);
    };

    describe('GET /examsessions/study/:id', () => {
        const path = (id: string) => `/examsessions/study/${id}`;

        it('whitelisted STUDENT -> 200 with the questions but no answer key, code, whitelist or email at any depth', async () => {
            const res = await call(
                t.server,
                'get',
                path(privateSession),
                tok.whitelisted
            );
            expect(res.status).toBe(200);
            expect(res.body.questions).toHaveLength(1);
            expect(res.body.questions[0]).toEqual({
                id: expect.any(String),
                question: 'Question 1',
                options: ['A1', 'B1', 'C1', 'D1'],
            });
            noLeaks(res.body);
        });

        it('public session -> any STUDENT 200 without leaks', async () => {
            const res = await call(
                t.server,
                'get',
                path(publicSession),
                tok.student
            );
            expect(res.status).toBe(200);
            noLeaks(res.body);
        });

        it('STUDENT without a grant -> 404 (private, no code)', async () => {
            expect(
                (await call(t.server, 'get', path(privateSession), tok.student))
                    .status
            ).toBe(404);
        });

        it('STUDENT without a grant on a code-protected session -> 403 CODE_REQUIRED', async () => {
            const res = await call(
                t.server,
                'get',
                path(codeSession),
                tok.student
            );
            expect(res.status).toBe(403);
            expect(res.body.code).toBe('CODE_REQUIRED');
        });

        it('code-unlocked STUDENT via with-code -> 201 without leaks', async () => {
            const res = await call(
                t.server,
                'post',
                `${path(codeSession)}/with-code`,
                tok.student,
                { accessCode: CODE }
            );
            expect(res.status).toBe(201);
            noLeaks(res.body);
        });

        it('host TEACHER (no exam:take), ADMIN-only -> 403; anonymous -> 401', async () => {
            expect(
                (await call(t.server, 'get', path(privateSession), tok.host))
                    .status
            ).toBe(403);
            expect(
                (
                    await call(
                        t.server,
                        'get',
                        path(privateSession),
                        tok.adminOnly
                    )
                ).status
            ).toBe(403);
            expect(
                (await call(t.server, 'get', path(privateSession))).status
            ).toBe(401);
        });
    });

    describe('GET /examsessions/study/:id/stats', () => {
        it('whitelisted STUDENT 200, STUDENT without a grant 404, TEACHER 403', async () => {
            const p = `/examsessions/study/${privateSession}/stats`;
            expect(
                (await call(t.server, 'get', p, tok.whitelisted)).status
            ).toBe(200);
            expect((await call(t.server, 'get', p, tok.student)).status).toBe(
                404
            );
            expect((await call(t.server, 'get', p, tok.host)).status).toBe(403);
        });
    });

    describe('gap 2: get-public (anonymous)', () => {
        it('PUBLIC session -> 200 and no email, code, whitelist or answer key', async () => {
            const res = await call(
                t.server,
                'get',
                `/examsessions/get-public/${publicSession}`
            );
            expect(res.status).toBe(200);
            noLeaks(res.body);
            expect(res.body.examRoom.host.name).toBeDefined();
        });

        it('private session -> 403', async () => {
            expect(
                (
                    await call(
                        t.server,
                        'get',
                        `/examsessions/get-public/${privateSession}`
                    )
                ).status
            ).toBe(403);
        });
    });

    describe('codes (RT-4)', () => {
        it('verify-code: STUDENT only (TEACHER/ADMIN 403, anonymous 401), locks after 5 wrong codes', async () => {
            const p = `/examsessions/study/${codeSession}/verify-code`;
            expect(
                (
                    await call(t.server, 'post', p, tok.host, {
                        accessCode: CODE,
                    })
                ).status
            ).toBe(403);
            expect(
                (
                    await call(t.server, 'post', p, tok.adminOnly, {
                        accessCode: CODE,
                    })
                ).status
            ).toBe(403);
            expect(
                (
                    await call(t.server, 'post', p, undefined, {
                        accessCode: CODE,
                    })
                ).status
            ).toBe(401);

            const attacker = await t.createUser(['STUDENT']);
            const at = await t.tokenFor(attacker);
            const statuses: number[] = [];
            for (let i = 0; i < 5; i++)
                statuses.push(
                    (
                        await call(t.server, 'post', p, at, {
                            accessCode: `11111${i}`,
                        })
                    ).status
                );
            expect(statuses).toEqual([400, 400, 400, 400, 429]);
            const locked = await call(t.server, 'post', p, at, {
                accessCode: CODE,
            });
            expect(locked.status).toBe(429);
            expect(locked.body.code).toBe('CODE_LOCKED');
            expect(
                (
                    await call(t.server, 'post', p, tok.student, {
                        accessCode: CODE,
                    })
                ).status
            ).toBe(201);
        });

        it('attempt start with accessCode uses the same lockout; the host branch is gone', async () => {
            const s = await seedExamSession(t, roomId, {
                assessType: 1,
                accessCode: CODE,
            });
            const u = await t.createUser(['STUDENT']);
            const ut = await t.tokenFor(u);
            const statuses: number[] = [];
            for (let i = 0; i < 5; i++) {
                statuses.push(
                    (
                        await call(
                            t.server,
                            'post',
                            '/examattempts/start',
                            ut,
                            { examSessionId: s, accessCode: `22222${i}` }
                        )
                    ).status
                );
            }
            expect(statuses).toEqual([400, 400, 400, 400, 429]);
            expect(
                (
                    await call(t.server, 'post', '/examattempts/start', ut, {
                        examSessionId: s,
                        accessCode: CODE,
                    })
                ).status
            ).toBe(429);
            const fresh = await t.tokenFor(await t.createUser(['STUDENT']));
            expect(
                (
                    await call(t.server, 'post', '/examattempts/start', fresh, {
                        examSessionId: s,
                        accessCode: CODE,
                    })
                ).status
            ).toBe(201);
            // the host of a private session can not start it either (and has no exam:take anyway)
            expect(
                (
                    await call(
                        t.server,
                        'post',
                        '/examattempts/start',
                        tok.host,
                        { examSessionId: s, accessCode: CODE }
                    )
                ).status
            ).toBe(403);
        });
    });

    describe('gap 6: generate-code and sharing', () => {
        it('generate-code keeps the whitelist and the visibility, host only', async () => {
            const s = await seedExamSession(t, roomId, {
                assessType: 1,
                whitelist: [whitelisted.id],
                accessCode: CODE,
            });
            const res = await call(
                t.server,
                'post',
                `/examsessions/${s}/generate-code`,
                tok.host
            );
            expect(res.status).toBe(201);
            expect(res.body.accessCode).toMatch(/^\d{6}$/);
            const row = await t.prisma.examSession.findUniqueOrThrow({
                where: { id: s },
            });
            expect(row.whitelist).toEqual([whitelisted.id]);
            expect(row.assessType).toBe(1);
            expect(row.accessCode).toBe(res.body.accessCode);
            expect(
                (
                    await call(
                        t.server,
                        'post',
                        `/examsessions/${s}/generate-code`,
                        tok.otherTeacher
                    )
                ).status
            ).toBe(404);
            expect(
                (
                    await call(
                        t.server,
                        'post',
                        `/examsessions/${s}/generate-code`,
                        tok.student
                    )
                ).status
            ).toBe(403);
        });

        it('a public session keeps its visibility when a code is generated', async () => {
            const s = await seedExamSession(t, roomId, { assessType: 0 });
            await call(
                t.server,
                'post',
                `/examsessions/${s}/generate-code`,
                tok.host
            );
            expect(
                (
                    await t.prisma.examSession.findUniqueOrThrow({
                        where: { id: s },
                    })
                ).assessType
            ).toBe(0);
        });
    });

    describe('gap 5: users/search', () => {
        it('TEACHER only, q >= 3, no email in the result', async () => {
            const target = await t.createUser(['STUDENT']);
            const prefix = target.id.slice(0, 6);
            expect(
                (
                    await call(
                        t.server,
                        'get',
                        `/examsessions/users/search?q=${prefix}`,
                        tok.student
                    )
                ).status
            ).toBe(403);
            expect(
                (
                    await call(
                        t.server,
                        'get',
                        `/examsessions/users/search?q=${prefix}`,
                        tok.adminOnly
                    )
                ).status
            ).toBe(403);
            expect(
                (
                    await call(
                        t.server,
                        'get',
                        '/examsessions/users/search?q=ab',
                        tok.host
                    )
                ).status
            ).toBe(400);
            const res = await call(
                t.server,
                'get',
                `/examsessions/users/search?q=${prefix}`,
                tok.host
            );
            expect(res.status).toBe(200);
            expect(res.body.map((u: { id: string }) => u.id)).toContain(
                target.id
            );
            expect(keysDeep(res.body).has('email')).toBe(false);
        });
    });
});
