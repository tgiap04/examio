import {
    bootExamApp,
    rid,
    type ExamTestApp,
    type TestUser,
} from './support/exam-test-app';
import { call } from './support/http';
import { seedExamRoom, seedExamSession } from './support/seed';

/**
 * Progress, pins and recents (gap 7). Titles carry the allowlist keys of the
 * two `@RequireOwnerOrPermission` progress handlers.
 */
describe('flashcard-study + student ownership (e2e)', () => {
    let t: ExamTestApp;
    let owner: TestUser;
    let otherTeacher: TestUser;
    let student: TestUser;
    let whitelisted: TestUser;
    let adminOnly: TestUser;
    let privateSet: string;
    let publicSet: string;
    const tok: Record<string, string> = {};

    async function seedSet(over: Record<string, unknown>) {
        const id = `fs_${rid()}`;
        await t.prisma.flashCardSet.create({
            data: { id, title: id, userId: owner.id, ...over } as never,
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
        for (const [k, u] of Object.entries({
            owner,
            otherTeacher,
            student,
            whitelisted,
            adminOnly,
        }))
            tok[k] = await t.tokenFor(u);
        privateSet = await seedSet({
            isPublic: false,
            whitelist: [whitelisted.id],
        });
        publicSet = await seedSet({ isPublic: true });
    });
    afterAll(() => t.close());

    describe.each([
        ['FlashcardStudyController.saveProgress', 'post' as const],
        ['FlashcardStudyController.getProgress', 'get' as const],
    ])('%s', (key, method) => {
        const path = (id: string) => `/flashcard-study/progress/${id}`;
        const body = (m: string) =>
            m === 'post' ? { studiedCardIds: [] } : undefined;

        it(`${key} owner TEACHER and whitelisted STUDENT -> 2xx`, async () => {
            for (const k of ['owner', 'whitelisted']) {
                const res = await call(
                    t.server,
                    method,
                    path(privateSet),
                    tok[k],
                    body(method)
                );
                expect(res.status).toBeLessThan(300);
            }
        });

        it(`${key} other TEACHER -> 403 (no flashcard:study, not the owner)`, async () => {
            expect(
                (
                    await call(
                        t.server,
                        method,
                        path(privateSet),
                        tok.otherTeacher,
                        body(method)
                    )
                ).status
            ).toBe(403);
        });

        it(`${key} STUDENT without a grant -> 404, with a public set -> 2xx`, async () => {
            expect(
                (
                    await call(
                        t.server,
                        method,
                        path(privateSet),
                        tok.student,
                        body(method)
                    )
                ).status
            ).toBe(404);
            expect(
                (
                    await call(
                        t.server,
                        method,
                        path(publicSet),
                        tok.student,
                        body(method)
                    )
                ).status
            ).toBeLessThan(300);
        });

        it(`${key} ADMIN-only -> 403, anonymous -> 401`, async () => {
            expect(
                (
                    await call(
                        t.server,
                        method,
                        path(privateSet),
                        tok.adminOnly,
                        body(method)
                    )
                ).status
            ).toBe(403);
            expect(
                (
                    await call(
                        t.server,
                        method,
                        path(privateSet),
                        undefined,
                        body(method)
                    )
                ).status
            ).toBe(401);
        });
    });

    describe('gap 7: pins', () => {
        it('pin-flashcard: inaccessible set -> 404, whitelisted -> 201, TEACHER -> 403', async () => {
            expect(
                (
                    await call(
                        t.server,
                        'post',
                        `/student/pin-flashcard/${privateSet}`,
                        tok.student
                    )
                ).status
            ).toBe(404);
            expect(
                (
                    await call(
                        t.server,
                        'post',
                        `/student/pin-flashcard/${privateSet}`,
                        tok.whitelisted
                    )
                ).status
            ).toBe(201);
            expect(
                (
                    await call(
                        t.server,
                        'post',
                        `/student/pin-flashcard/${privateSet}`,
                        tok.owner
                    )
                ).status
            ).toBe(403);
        });

        it('pin-flashcard: unpinning still works after access is gone', async () => {
            const set = await seedSet({
                isPublic: false,
                whitelist: [student.id],
            });
            expect(
                (
                    await call(
                        t.server,
                        'post',
                        `/student/pin-flashcard/${set}`,
                        tok.student
                    )
                ).body
            ).toEqual({ pinned: true });
            await t.prisma.flashCardSet.update({
                where: { id: set },
                data: { whitelist: [] },
            });
            expect(
                (
                    await call(
                        t.server,
                        'post',
                        `/student/pin-flashcard/${set}`,
                        tok.student
                    )
                ).body
            ).toEqual({ pinned: false });
        });

        it('pin-exam-room: no session access -> 404; public or attempted session -> 201; TEACHER -> 403', async () => {
            const room = await seedExamRoom(t, owner.id);
            await seedExamSession(t, room.id, { assessType: 1 });
            expect(
                (
                    await call(
                        t.server,
                        'post',
                        `/student/pin-exam-room/${room.id}`,
                        tok.student
                    )
                ).status
            ).toBe(404);
            await seedExamSession(t, room.id, { assessType: 0 });
            expect(
                (
                    await call(
                        t.server,
                        'post',
                        `/student/pin-exam-room/${room.id}`,
                        tok.student
                    )
                ).status
            ).toBe(201);
            expect(
                (
                    await call(
                        t.server,
                        'post',
                        `/student/pin-exam-room/${room.id}`,
                        tok.owner
                    )
                ).status
            ).toBe(403);
        });
    });

    describe('gap 7: recent-flashcards', () => {
        it('lists own, whitelisted and viewed sets, not every public set', async () => {
            const lonelyPublic = await seedSet({ isPublic: true });
            const res = await call(
                t.server,
                'get',
                '/student/recent-flashcards?limit=50',
                tok.whitelisted
            );
            expect(res.status).toBe(200);
            const ids = res.body.flashcardSets.map((s: { id: string }) => s.id);
            expect(ids).toContain(privateSet);
            expect(ids).not.toContain(lonelyPublic);
            // after studying the public set it shows up
            expect(
                (
                    await call(
                        t.server,
                        'get',
                        `/flashcardsets/study/${lonelyPublic}`,
                        tok.whitelisted
                    )
                ).status
            ).toBe(200);
            const after = await call(
                t.server,
                'get',
                '/student/recent-flashcards?limit=50',
                tok.whitelisted
            );
            expect(
                after.body.flashcardSets.map((s: { id: string }) => s.id)
            ).toContain(lonelyPublic);
        });

        it('TEACHER and anonymous are refused', async () => {
            expect(
                (
                    await call(
                        t.server,
                        'get',
                        '/student/recent-flashcards',
                        tok.owner
                    )
                ).status
            ).toBe(403);
            expect(
                (
                    await call(
                        t.server,
                        'get',
                        '/student/recent-exams',
                        tok.owner
                    )
                ).status
            ).toBe(403);
            expect(
                (await call(t.server, 'get', '/student/recent-flashcards'))
                    .status
            ).toBe(401);
        });
    });
});
