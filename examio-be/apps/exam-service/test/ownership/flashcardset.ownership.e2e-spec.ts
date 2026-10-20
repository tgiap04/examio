import {
    bootExamApp,
    rid,
    type ExamTestApp,
    type TestUser,
} from './support/exam-test-app';
import { call, keysDeep } from './support/http';

/**
 * Actor x relation matrix for flashcard sets (real Postgres + Redis, real
 * guards). Titles carry the AUTHENTICATED_ALLOWLIST keys.
 */
describe('flashcardset ownership (e2e)', () => {
    let t: ExamTestApp;
    let owner: TestUser;
    let otherTeacher: TestUser;
    let student: TestUser;
    let whitelisted: TestUser;
    let adminOnly: TestUser;
    let setId: string;
    let publicSetId: string;
    const CODE = '482913';
    const tok: Record<string, string> = {};

    async function seedSet(over: Record<string, unknown>) {
        const id = `fs_${rid()}`;
        await t.prisma.flashCardSet.create({
            data: {
                id,
                title: `set ${id}`,
                userId: owner.id,
                ...over,
            } as never,
        });
        const card = await t.prisma.flashCard.create({
            data: { id: `fc_${rid()}`, question: 'Q', answer: 'A' },
        });
        await t.prisma.detailsFlashCard.create({
            data: { flashCardSetId: id, flashCardId: card.id },
        });
        return id;
    }

    beforeAll(async () => {
        t = await bootExamApp();
        owner = await t.createUser(['TEACHER']);
        otherTeacher = await t.createUser(['TEACHER']);
        student = await t.createUser(['STUDENT']);
        whitelisted = await t.createUser(['STUDENT']);
        adminOnly = await t.createUser(['SYSTEM_ADMIN']);
        setId = await seedSet({
            isPublic: false,
            accessCode: CODE,
            whitelist: [whitelisted.id],
        });
        publicSetId = await seedSet({ isPublic: true });
        for (const [k, u] of Object.entries({
            owner,
            otherTeacher,
            student,
            whitelisted,
            adminOnly,
        })) {
            tok[k] = await t.tokenFor(u);
        }
    });
    afterAll(() => t.close());

    describe('FlashcardsetController.getForStudy: GET /flashcardsets/study/:id', () => {
        const path = () => `/flashcardsets/study/${setId}`;

        it('FlashcardsetController.getForStudy owner TEACHER previews own set -> 200', async () => {
            const res = await call(t.server, 'get', path(), tok.owner);
            expect(res.status).toBe(200);
            expect(res.body.flashCards).toHaveLength(1);
        });

        it('FlashcardsetController.getForStudy other TEACHER -> 403 PERMISSION_DENIED', async () => {
            const res = await call(t.server, 'get', path(), tok.otherTeacher);
            expect(res.status).toBe(403);
            expect(res.body.code).toBe('PERMISSION_DENIED');
        });

        it('FlashcardsetController.getForStudy STUDENT without a grant -> 404 (no code on the set)', async () => {
            const plain = await seedSet({ isPublic: false });
            expect(
                (
                    await call(
                        t.server,
                        'get',
                        `/flashcardsets/study/${plain}`,
                        tok.student
                    )
                ).status
            ).toBe(404);
        });

        it('FlashcardsetController.getForStudy STUDENT on a code-protected set -> 403 CODE_REQUIRED', async () => {
            const res = await call(t.server, 'get', path(), tok.student);
            expect(res.status).toBe(403);
            expect(res.body.code).toBe('CODE_REQUIRED');
        });

        it('FlashcardsetController.getForStudy whitelisted STUDENT -> 200 without code or whitelist keys', async () => {
            const res = await call(t.server, 'get', path(), tok.whitelisted);
            expect(res.status).toBe(200);
            const keys = keysDeep(res.body);
            expect(keys.has('accessCode')).toBe(false);
            expect(keys.has('whitelist')).toBe(false);
        });

        it('FlashcardsetController.getForStudy SYSTEM_ADMIN-only token -> 403', async () => {
            expect(
                (await call(t.server, 'get', path(), tok.adminOnly)).status
            ).toBe(403);
        });

        it('FlashcardsetController.getForStudy anonymous -> 401', async () => {
            expect((await call(t.server, 'get', path())).status).toBe(401);
        });

        it('FlashcardsetController.getForStudy code-unlocked STUDENT via with-code -> 200 and no leaks', async () => {
            const res = await call(
                t.server,
                'post',
                `/flashcardsets/study/${setId}/with-code`,
                tok.student,
                {
                    accessCode: CODE,
                }
            );
            expect(res.status).toBe(201);
            const keys = keysDeep(res.body);
            expect(keys.has('accessCode')).toBe(false);
            expect(keys.has('whitelist')).toBe(false);
        });
    });

    describe('codes: verify-code / with-code (RT-4)', () => {
        it('verify-code TEACHER and ADMIN-only -> 403, anonymous -> 401', async () => {
            const p = `/flashcardsets/study/${setId}/verify-code`;
            expect(
                (
                    await call(t.server, 'post', p, tok.owner, {
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
        });

        it('locks a user after 5 wrong codes, even for the right one; another user is unaffected', async () => {
            const victimSet = await seedSet({
                isPublic: false,
                accessCode: CODE,
            });
            const attacker = await t.createUser(['STUDENT']);
            const at = await t.tokenFor(attacker);
            const p = `/flashcardsets/study/${victimSet}/verify-code`;
            const statuses: number[] = [];
            for (let i = 0; i < 5; i++) {
                statuses.push(
                    (
                        await call(t.server, 'post', p, at, {
                            accessCode: `00000${i}`,
                        })
                    ).status
                );
            }
            expect(statuses).toEqual([400, 400, 400, 400, 429]);
            const locked = await call(t.server, 'post', p, at, {
                accessCode: CODE,
            });
            expect(locked.status).toBe(429);
            expect(locked.body.code).toBe('CODE_LOCKED');
            expect(locked.body.retryAfterSeconds).toBeGreaterThan(0);
            expect(
                (
                    await call(t.server, 'post', p, tok.student, {
                        accessCode: CODE,
                    })
                ).status
            ).toBe(201);
        });

        it('rejects a malformed code with 400 before counting', async () => {
            const res = await call(
                t.server,
                'post',
                `/flashcardsets/study/${setId}/verify-code`,
                tok.student,
                {
                    accessCode: '12ab',
                }
            );
            expect(res.status).toBe(400);
        });
    });

    describe('gap 3: public + info payloads', () => {
        it('anonymous GET public/:id has no accessCode or whitelist keys', async () => {
            const res = await call(
                t.server,
                'get',
                `/flashcardsets/public/${publicSetId}`
            );
            expect(res.status).toBe(200);
            const keys = keysDeep(res.body);
            expect(keys.has('accessCode')).toBe(false);
            expect(keys.has('whitelist')).toBe(false);
        });
    });

    describe('gap 6 + share: sharing endpoints', () => {
        it('POST :id/share is owner-only (other TEACHER and a STUDENT are refused)', async () => {
            const pub = await seedSet({ isPublic: true });
            expect(
                (
                    await call(
                        t.server,
                        'post',
                        `/flashcardsets/${pub}/share`,
                        tok.otherTeacher
                    )
                ).status
            ).toBe(404);
            expect(
                (
                    await call(
                        t.server,
                        'post',
                        `/flashcardsets/${pub}/share`,
                        tok.student
                    )
                ).status
            ).toBe(403);
            expect(
                (
                    await call(
                        t.server,
                        'post',
                        `/flashcardsets/${pub}/share`,
                        tok.owner
                    )
                ).status
            ).toBe(201);
        });

        it('generate-code keeps the whitelist and the visibility', async () => {
            const id = await seedSet({
                isPublic: false,
                accessCode: CODE,
                whitelist: [whitelisted.id],
            });
            const res = await call(
                t.server,
                'post',
                `/flashcardsets/${id}/generate-code`,
                tok.owner
            );
            expect(res.status).toBe(201);
            expect(res.body.accessCode).toMatch(/^\d{6}$/);
            const row = await t.prisma.flashCardSet.findUniqueOrThrow({
                where: { id },
            });
            expect(row.whitelist).toEqual([whitelisted.id]);
            expect(row.isPublic).toBe(false);
            expect(row.accessCode).toBe(res.body.accessCode);
        });

        it('sharing endpoints are owner-only (other TEACHER 404) and TEACHER-only (STUDENT 403)', async () => {
            const p = `/flashcardsets/${setId}/sharing`;
            expect(
                (await call(t.server, 'get', p, tok.otherTeacher)).status
            ).toBe(404);
            expect((await call(t.server, 'get', p, tok.student)).status).toBe(
                403
            );
            expect((await call(t.server, 'get', p, tok.owner)).status).toBe(
                200
            );
        });
    });

    describe('gap 5: users/search', () => {
        it('is TEACHER-only, needs q >= 3, never returns emails', async () => {
            const target = await t.createUser(['STUDENT']);
            const prefix = target.id.slice(0, 6);
            expect(
                (
                    await call(
                        t.server,
                        'get',
                        `/flashcardsets/users/search?q=${prefix}`,
                        tok.student
                    )
                ).status
            ).toBe(403);
            expect(
                (
                    await call(
                        t.server,
                        'get',
                        '/flashcardsets/users/search?q=ab',
                        tok.owner
                    )
                ).status
            ).toBe(400);
            const res = await call(
                t.server,
                'get',
                `/flashcardsets/users/search?q=${prefix}`,
                tok.owner
            );
            expect(res.status).toBe(200);
            expect(res.body.map((u: { id: string }) => u.id)).toContain(
                target.id
            );
            expect(keysDeep(res.body).has('email')).toBe(false);
        });

        it('matches email only exactly, and a partial email finds nobody', async () => {
            const target = await t.createUser(['STUDENT']);
            const exact = await call(
                t.server,
                'get',
                `/flashcardsets/users/search?q=${target.id}@own.test`,
                tok.owner
            );
            expect(exact.body.map((u: { id: string }) => u.id)).toEqual([
                target.id,
            ]);
            const partial = await call(
                t.server,
                'get',
                '/flashcardsets/users/search?q=%40own.test',
                tok.owner
            );
            expect(partial.body).toEqual([]);
        });
    });
});
