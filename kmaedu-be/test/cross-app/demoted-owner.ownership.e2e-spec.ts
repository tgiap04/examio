import { GenerateIdService } from '@kmaedu/common';
import { createPrismaAdapter as createAuthAdapter } from '../../apps/auth-service/src/prisma/create-prisma-adapter';
import { PrismaClient as AuthPrismaClient } from '../../apps/auth-service/src/generated/prisma/client';
import type { PrismaService as AuthPrismaService } from '../../apps/auth-service/src/prisma';
import { serviceDatabaseUrl } from './helpers/real-auth-admin';
import { startRealContent, type RealContent } from './helpers/real-content';
import { RoleChangeRepository } from '../../apps/auth-service/src/roles/role-change.repository';
import { RoleChangeService } from '../../apps/auth-service/src/roles/role-change.service';
import {
    bootAssessmentApp,
    rid,
    type AssessmentTestApp,
    type TestUser,
} from '../../apps/assessment-service/test/ownership/support/assessment-test-app';
import { call } from '../../apps/assessment-service/test/ownership/support/http';
import { seedExamRoom, seedExamSession } from '../../apps/assessment-service/test/ownership/support/seed';

/**
 * Owner-role independence (decision 2026-10-18): access to shared content is
 * decided from the content's own sharing fields, never from the owner's current
 * role. The demotion goes through the real auth `RoleChangeService`. The harness
 * boots assessment and, next to it, the real content-service: flashcards and quiz
 * practice are asked of content, exam sessions of assessment, with the same tokens.
 */
/** One request, to the service that owns the path: exam sessions are assessment's, everything else content's. */
describe('demoted owner (e2e)', () => {
    let t: AssessmentTestApp<RealContent>;
    /** auth's own database: the account row and the role change live there, assessment only has the id. */
    let authDb: AuthPrismaClient;
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

    const route = (method: 'get' | 'post' | 'put', path: string, token?: string, body?: object) =>
        call(path.startsWith('/examsessions') || path.startsWith('/examattempts') ? t.server : t.content.server, method, path, token, body);

    /** A quiz set with one question in content's database, shared with `whitelist`. */
    async function seedRealQuizSet(ownerId: string, whitelist: string[]) {
        const id = `qs_${rid()}`;
        await t.content.prisma.quizSet.create({ data: { id, title: id, userId: ownerId, whitelist } });
        const q = await t.content.prisma.quizQuestion.create({
            data: { id: `qq_${rid()}`, question: 'Capital of France?', options: ['Paris', 'Rome'], answer: 'A' },
        });
        await t.content.prisma.detailsQuizQuestion.create({ data: { quizSetId: id, quizQuestionId: q.id } });
        return { id };
    }

    async function seedSet(over: Record<string, unknown>) {
        const id = `fs_${rid()}`;
        await t.content.prisma.flashCardSet.create({
            data: { id, title: id, userId: teacher.id, ...over } as never,
        });
        const card = await t.content.prisma.flashCard.create({
            data: { id: `fc_${rid()}`, question: 'Q', answer: 'A' },
        });
        await t.content.prisma.detailsFlashCard.create({
            data: { flashCardSetId: id, flashCardId: card.id },
        });
        return id;
    }

    beforeAll(async () => {
        process.env.DATABASE_URL = serviceDatabaseUrl('ASSESSMENT');
        const contentUrl = serviceDatabaseUrl('CONTENT');
        t = await bootAssessmentApp({
            content: (keys) =>
                startRealContent(keys, {
                    databaseUrl: contentUrl,
                    rabbitmqUrl: process.env.CONTENT_RABBITMQ_URL ?? (process.env.RABBITMQ_URL as string),
                }),
        });
        authDb = new AuthPrismaClient({ adapter: createAuthAdapter(serviceDatabaseUrl('AUTH')) });
        teacher = await t.createUser(['TEACHER']);
        await authDb.user.create({
            data: { id: teacher.id, email: `${teacher.id}@own.test`, username: teacher.id, role: 'TEACHER', isVerified: true },
        });
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
            new RoleChangeRepository(authDb as unknown as AuthPrismaService),
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
    afterAll(async () => {
        await t.close();
        await authDb.$disconnect();
    });

    it("demoted teacher's shared set still studyable by whitelisted student; demoted user gets 403 on manage", async () => {
        // students keep access to everything the teacher shared
        expect(
            (
                await route('get',
                    `/flashcardsets/study/${privateSet}`,
                    tok.student
                )
            ).status
        ).toBe(200);
        expect(
            (
                await route('get',
                    `/examsessions/study/${whitelistedSessionId}`,
                    tok.student
                )
            ).status
        ).toBe(200);
        expect(
            (
                await route('get',
                    `/examsessions/study/${whitelistedSessionId}/stats`,
                    tok.student
                )
            ).status
        ).toBe(200);
        // a code the teacher handed out keeps working (the unlock itself is not remembered until phase 07)
        expect(
            (
                await route('post',
                    `/examsessions/study/${sessionId}/with-code`,
                    tok.student,
                    { accessCode: CODE }
                )
            ).status
        ).toBe(201);
        expect(
            (await route('get', `/flashcardsets/public/${publicSet}`))
                .status
        ).toBe(200);
        expect(
            (
                await route('post',
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
            const res = await route(method, path, demotedToken, body);
            expect(`${method} ${path} ${res.status} ${res.body.code}`).toBe(
                `${method} ${path} 403 PERMISSION_DENIED`
            );
        }

        // content rows and owner ids are untouched
        const set = await t.content.prisma.flashCardSet.findUniqueOrThrow({
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
                await route('get',
                    `/flashcardsets/study/${privateSet}`,
                    demotedToken
                )
            ).status
        ).toBe(200);
    });

    it('the demotion persisted STUDENT and bumped the authz version (so old tokens go stale)', async () => {
        const row = await authDb.user.findUniqueOrThrow({
            where: { id: teacher.id },
        });
        expect(row.role).toBe('STUDENT');
        expect(row.authzVersion).toBeGreaterThan(0);
    });

    it("a whitelisted STUDENT still lists and practices a quiz set whose TEACHER owner was demoted", async () => {
        // seeded after the demotion: the set only has its own sharing fields to go on
        const quiz = await seedRealQuizSet(teacher.id, [student.id]);
        const list = await route('get', '/quiz-practice/sets', tok.student);
        expect(list.status).toBe(200);
        expect(list.body.sets.map((s: { id: string }) => s.id)).toContain(
            quiz.id
        );
        const start = await route('post',
            '/quiz-practice/attempts',
            tok.student,
            { quizSetId: quiz.id }
        );
        expect([200, 201]).toContain(start.status);
        // the demoted owner is a STUDENT now: their own set needs a grant like anyone's
        // (owner relation still lets them preview it)
        const own = await route('post',
            '/quiz-practice/attempts',
            demotedToken,
            { quizSetId: quiz.id }
        );
        expect([200, 201]).toContain(own.status);
    });
});
