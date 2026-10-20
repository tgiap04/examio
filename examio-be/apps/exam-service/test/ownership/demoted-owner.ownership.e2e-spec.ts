import { GenerateIdService } from '@examio/common';
import { RoleChangeRepository } from '../../../auth-service/src/roles/role-change.repository';
import { RoleChangeService } from '../../../auth-service/src/roles/role-change.service';
import {
    bootExamApp,
    rid,
    type ExamTestApp,
    type TestUser,
} from './support/exam-test-app';
import { call } from './support/http';
import { seedExamRoom, seedExamSession, seedQuizSet } from './support/seed';

/**
 * Owner-role independence (decision 2026-10-18): access to shared content is
 * decided from the content's own sharing fields, never from the owner's current
 * role. The demotion goes through the real auth `RoleChangeService`.
 */
describe('demoted owner (e2e)', () => {
    let t: ExamTestApp;
    let teacher: TestUser;
    let student: TestUser;
    let privateSet: string;
    let publicSet: string;
    let sessionId: string;
    let whitelistedSessionId: string;
    let roomId: string;
    const CODE = '618204';
    const tok: Record<string, string> = {};
    let demotedToken: string;

    async function seedSet(over: Record<string, unknown>) {
        const id = `fs_${rid()}`;
        await t.prisma.flashCardSet.create({
            data: { id, title: id, userId: teacher.id, ...over } as never,
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
        teacher = await t.createUser(['TEACHER']);
        student = await t.createUser(['STUDENT']);
        privateSet = await seedSet({
            isPublic: false,
            whitelist: [student.id],
        });
        publicSet = await seedSet({ isPublic: true });
        const room = await seedExamRoom(t, teacher.id);
        roomId = room.id;
        sessionId = await seedExamSession(t, roomId, {
            assessType: 1,
            accessCode: CODE,
        });
        whitelistedSessionId = await seedExamSession(t, roomId, {
            assessType: 1,
            whitelist: [student.id],
        });
        tok.teacher = await t.tokenFor(teacher);
        tok.student = await t.tokenFor(student);

        const roleChange = new RoleChangeService(
            new RoleChangeRepository(t.prisma),
            { publish: async () => undefined } as never,
            { invalidateUser: async () => undefined } as never,
            new GenerateIdService()
        );
        const result = await roleChange.change({
            actor: { kind: 'system', email: 'p06-test@example.test' },
            targetUserId: teacher.id,
            role: 'STUDENT',
            reason: 'phase-06 demoted-owner e2e',
            source: 'cli',
        });
        expect(result.changed).toBe(true);
        expect(result.user.role).toBe('STUDENT');
        // tokens are re-minted after the change, with the bumped authz version
        demotedToken = await t.tokenFor({
            id: teacher.id,
            roles: ['STUDENT'],
            av: result.user.authzVersion,
        });
    });
    afterAll(() => t.close());

    it("demoted teacher's shared set still studyable by whitelisted student; demoted user gets 403 on manage", async () => {
        // students keep access to everything the teacher shared
        expect(
            (
                await call(
                    t.server,
                    'get',
                    `/flashcardsets/study/${privateSet}`,
                    tok.student
                )
            ).status
        ).toBe(200);
        expect(
            (
                await call(
                    t.server,
                    'get',
                    `/examsessions/study/${whitelistedSessionId}`,
                    tok.student
                )
            ).status
        ).toBe(200);
        expect(
            (
                await call(
                    t.server,
                    'get',
                    `/examsessions/study/${whitelistedSessionId}/stats`,
                    tok.student
                )
            ).status
        ).toBe(200);
        // a code the teacher handed out keeps working (the unlock itself is not remembered until phase 07)
        expect(
            (
                await call(
                    t.server,
                    'post',
                    `/examsessions/study/${sessionId}/with-code`,
                    tok.student,
                    { accessCode: CODE }
                )
            ).status
        ).toBe(201);
        expect(
            (await call(t.server, 'get', `/flashcardsets/public/${publicSet}`))
                .status
        ).toBe(200);
        expect(
            (
                await call(
                    t.server,
                    'post',
                    `/flashcardsets/study/${privateSet}/verify-code`,
                    tok.student,
                    { accessCode: CODE }
                )
            ).status
        ).toBe(400);

        // management is locked for the (now STUDENT) owner
        for (const [method, path, body] of [
            ['put', `/flashcardsets/${privateSet}`, { title: 'x' }],
            ['post', '/quizsets', { title: 'x' }],
            ['put', `/examsessions/${sessionId}`, {}],
            ['get', `/flashcardsets/${privateSet}/sharing`, undefined],
        ] as const) {
            const res = await call(t.server, method, path, demotedToken, body);
            expect(`${method} ${path} ${res.status} ${res.body.code}`).toBe(
                `${method} ${path} 403 PERMISSION_DENIED`
            );
        }

        // content rows and owner ids are untouched
        const set = await t.prisma.flashCardSet.findUniqueOrThrow({
            where: { id: privateSet },
        });
        expect(set.userId).toBe(teacher.id);
        expect(set.whitelist).toEqual([student.id]);
        const room = await t.prisma.examRoom.findUniqueOrThrow({
            where: { id: roomId },
        });
        expect(room.hostId).toBe(teacher.id);
    });

    it('the demoted user, now a STUDENT, can still study their own set (owner relation)', async () => {
        expect(
            (
                await call(
                    t.server,
                    'get',
                    `/flashcardsets/study/${privateSet}`,
                    demotedToken
                )
            ).status
        ).toBe(200);
    });

    it('the demotion persisted STUDENT and bumped the authz version (so old tokens go stale)', async () => {
        const row = await t.prisma.user.findUniqueOrThrow({
            where: { id: teacher.id },
        });
        expect(row.role).toBe('STUDENT');
        expect(row.authzVersion).toBeGreaterThan(0);
    });

    it("a whitelisted STUDENT still lists and practices a quiz set whose TEACHER owner was demoted", async () => {
        // seeded after the demotion: the set only has its own sharing fields to go on
        const quiz = await seedQuizSet(t, teacher.id, {
            whitelist: [student.id],
        });
        const list = await call(t.server, 'get', '/quiz-practice/sets', tok.student);
        expect(list.status).toBe(200);
        expect(list.body.sets.map((s: { id: string }) => s.id)).toContain(
            quiz.id
        );
        const start = await call(
            t.server,
            'post',
            '/quiz-practice/attempts',
            tok.student,
            { quizSetId: quiz.id }
        );
        expect([200, 201]).toContain(start.status);
        // the demoted owner is a STUDENT now: their own set needs a grant like anyone's
        // (owner relation still lets them preview it)
        const own = await call(
            t.server,
            'post',
            '/quiz-practice/attempts',
            demotedToken,
            { quizSetId: quiz.id }
        );
        expect([200, 201]).toContain(own.status);
    });
});
