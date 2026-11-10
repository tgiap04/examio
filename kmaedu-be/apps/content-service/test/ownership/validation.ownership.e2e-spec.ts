import {
    bootContentApp,
    rid,
    type ContentTestApp,
    type TestUser,
} from './support/content-test-app';
import * as request from 'supertest';
import { call } from './support/http';
import { seedQuizSet } from './support/seed';

/** Malformed input must be a 400 from the Zod pipe, never a 500 from Prisma; valid input is unchanged. */
describe('request validation (e2e)', () => {
    let t: ContentTestApp;
    let teacher: TestUser;
    let student: TestUser;
    let setId: string;
    let quizId: string;
    const tok: Record<string, string> = {};

    beforeAll(async () => {
        t = await bootContentApp();
        teacher = await t.createUser(['TEACHER']);
        student = await t.createUser(['STUDENT']);
        tok.teacher = await t.tokenFor(teacher);
        tok.student = await t.tokenFor(student);
        setId = `fs_${rid()}`;
        await t.prisma.flashCardSet.create({
            data: { id: setId, title: 't', userId: teacher.id, isPublic: true },
        });
        quizId = (await seedQuizSet(t, teacher.id)).id;
    });
    afterAll(() => t.close());

    const bad: Array<
        [string, 'post' | 'put', () => string, 'teacher' | 'student', object]
    > = [
        [
            'POST /flashcardsets/:id/flashcards {}',
            'post',
            () => `/flashcardsets/${setId}/flashcards`,
            'teacher',
            {},
        ],
        [
            'POST /flashcardsets/:id/labels {}',
            'post',
            () => `/flashcardsets/${setId}/labels`,
            'teacher',
            {},
        ],
        [
            'PUT /flashcardsets/:id/sharing {}',
            'put',
            () => `/flashcardsets/${setId}/sharing`,
            'teacher',
            {},
        ],
        [
            'POST /quizsets/:id/questions {}',
            'post',
            () => `/quizsets/${quizId}/questions`,
            'teacher',
            {},
        ],
        [
            'POST /quizsets/:id/labels {}',
            'post',
            () => `/quizsets/${quizId}/labels`,
            'teacher',
            {},
        ],
        [
            'POST /ai/regenerate/:id {quantityQuizz: 999}',
            'post',
            () => '/ai/regenerate/some-upload',
            'teacher',
            { quantityQuizz: 999 },
        ],
        [
            'POST /flashcard-study/progress/:id wrong type',
            'post',
            () => `/flashcard-study/progress/${setId}`,
            'student',
            { studiedCardIds: 'nope' },
        ],
        [
            'POST /student/pin-flashcard/:id fine but GET recent page=abc',
            'post',
            () => '/student/pin-flashcard/x',
            'student',
            {},
        ],
    ];

    it.each(bad.filter(([name]) => !name.startsWith('POST /student')))(
        '%s -> 400',
        async (_n, method, path, who, body) => {
            const res = await call(t.server, method, path(), tok[who], body);
            expect(res.status).toBe(400);
        }
    );

    it.each([
        ['/flashcardsets?page=abc', 'teacher'],
        ['/quizsets?limit=1000', 'teacher'],
        ['/student/recent-flashcards?limit=abc', 'student'],
        ['/ai/recent-uploads?page=abc', 'teacher'],
    ] as const)('malformed query %s -> 400', async (path, who) => {
        expect((await call(t.server, 'get', path, tok[who])).status).toBe(400);
    });

    it('valid requests are unchanged', async () => {
        const checks: Array<Promise<{ status: number }>> = [
            call(
                t.server,
                'get',
                '/flashcardsets?page=1&limit=5&isPublic=true&isPinned=false&tag=a&tag=b',
                tok.teacher
            ),
            call(t.server, 'get', '/flashcardsets?tag=solo', tok.teacher),
            call(
                t.server,
                'get',
                '/quizsets?page=2&limit=10&search=x&isPublic=false',
                tok.teacher
            ),
            call(
                t.server,
                'get',
                '/student/recent-flashcards?limit=5&page=1',
                tok.student
            ),
        ];
        for (const r of await Promise.all(checks)) expect(r.status).toBe(200);
        const created = await call(
            t.server,
            'post',
            `/flashcardsets/${setId}/labels`,
            tok.teacher,
            { name: 'L1', color: '#aabbcc' }
        );
        expect(created.status).toBe(201);
        const card = await call(
            t.server,
            'post',
            `/flashcardsets/${setId}/flashcards`,
            tok.teacher,
            { question: 'q', answer: 'a' }
        );
        expect(card.status).toBe(201);
    });

    describe('multipart create/update (FE builders: fields as text, optional file)', () => {
        const form = (
            method: 'post' | 'put',
            path: string,
            who: 'teacher' | 'student',
            fields: Record<string, string>
        ) => {
            let r = request(t.server)
                [method](`/api/v1${path}`)
                .set('Authorization', `Bearer ${tok[who]}`);
            for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
            return r;
        };

        it.each([
            ['/quizsets', 'quizsets'],
            ['/flashcardsets', 'flashcardsets'],
        ])(
            'POST %s: FE-shaped fields -> 201 with the parsed types',
            async (path, kind) => {
                const res = await form('post', path, 'teacher', {
                    title: 'From FE',
                    description: 'd',
                    isPublic: 'true',
                    isPinned: 'false',
                    tags: JSON.stringify(['a', 'b']),
                });
                expect(res.status).toBe(201);
                const row =
                    kind === 'quizsets'
                        ? await t.prisma.quizSet.findFirstOrThrow({
                              where: { title: 'From FE', userId: teacher.id },
                              orderBy: { createdAt: 'desc' },
                          })
                        : await t.prisma.flashCardSet.findFirstOrThrow({
                              where: { title: 'From FE', userId: teacher.id },
                              orderBy: { createdAt: 'desc' },
                          });
                expect(row.isPublic).toBe(true);
                expect(row.isPinned).toBe(false);
            }
        );

        it.each(['/quizsets', '/flashcardsets'])(
            'POST %s: malformed multipart -> 400 (never 409/500)',
            async (path) => {
                expect(
                    (
                        await form('post', path, 'teacher', {
                            description: 'no title',
                        })
                    ).status
                ).toBe(400);
                expect(
                    (
                        await form('post', path, 'teacher', {
                            title: 'x',
                            isPublic: 'yes',
                        })
                    ).status
                ).toBe(400);
                expect(
                    (
                        await form('post', path, 'teacher', {
                            title: 'x',
                            tags: '[not json',
                        })
                    ).status
                ).toBe(400);
                expect(
                    (
                        await form('post', path, 'teacher', {
                            title: 'x',
                            tags: '{"a":1}',
                        })
                    ).status
                ).toBe(400);
                expect(
                    (
                        await call(t.server, 'post', path, tok.teacher, {
                            title: 123,
                        })
                    ).status
                ).toBe(400);
                expect(
                    (await call(t.server, 'post', path, tok.teacher, {})).status
                ).toBe(400);
            }
        );

        it('PUT /quizsets/:id and /flashcardsets/:id: FE fields update, unsent fields stay, malformed -> 400', async () => {
            const res = await form(
                'put',
                `/flashcardsets/${setId}`,
                'teacher',
                { title: 'renamed', isPinned: 'true' }
            );
            expect(res.status).toBe(200);
            const row = await t.prisma.flashCardSet.findUniqueOrThrow({
                where: { id: setId },
            });
            expect(row.title).toBe('renamed');
            expect(row.isPinned).toBe(true);
            expect(row.isPublic).toBe(true); // not sent: untouched
            expect(
                (
                    await form('put', `/flashcardsets/${setId}`, 'teacher', {
                        isPublic: 'yes',
                    })
                ).status
            ).toBe(400);
            expect(
                (
                    await form('put', `/quizsets/${quizId}`, 'teacher', {
                        title: 'qrenamed',
                        tags: JSON.stringify(['x']),
                    })
                ).status
            ).toBe(200);
            expect(
                (
                    await form('put', `/quizsets/${quizId}`, 'teacher', {
                        isPinned: 'maybe',
                    })
                ).status
            ).toBe(400);
        });
    });

});
