import { Metadata, status } from '@grpc/grpc-js';
import { lastValueFrom } from 'rxjs';
import { bootContentApp, rid, type ContentTestApp, type TestUser } from './support/content-test-app';
import { seedQuizSet, seedQuizSetWithContent } from './support/seed';

const code = async (promise: Promise<unknown>): Promise<number | undefined> => {
    try {
        await promise;
        return undefined;
    } catch (error) {
        return (error as { code?: number }).code;
    }
};

/**
 * ContentService behind its real gRPC server, real Postgres and the real guards: the owner is the
 * `sub` of the forwarded user token; a set that is not the caller's is NOT_FOUND (or omitted), never
 * PERMISSION_DENIED; no token is UNAUTHENTICATED. The snapshot hash is the same from both RPCs.
 */
describe('ContentService gRPC contract (e2e)', () => {
    let t: ContentTestApp;
    let teacher: TestUser;
    let otherTeacher: TestUser;
    let student: TestUser;
    let set: Awaited<ReturnType<typeof seedQuizSetWithContent>>;

    beforeAll(async () => {
        t = await bootContentApp();
        teacher = await t.createUser(['TEACHER']);
        otherTeacher = await t.createUser(['TEACHER']);
        student = await t.createUser(['STUDENT']);
        set = await seedQuizSetWithContent(
            t,
            teacher.id,
            ['Part A', 'Part B'],
            [
                { question: 'Q1', label: 'Part A' },
                { question: 'Q2', label: 'Part A' },
                { question: 'Q3', label: 'Part B', answer: 'C' },
                { question: 'Q4', label: 'Part B' },
                { question: 'Q5' },
            ]
        );
    });
    afterAll(() => t?.close());

    const snapshot = async (user: TestUser, quizSetId = set.id) =>
        lastValueFrom(t.contentGrpc.getQuizSetSnapshot({ quizSetId }, await t.md(user)));
    const summaries = async (user: TestUser, ids: string[], withContentHash: boolean) =>
        (await lastValueFrom(t.contentGrpc.getQuizSetsByIds({ ids, withContentHash }, await t.md(user)))).quizSets;

    describe('GetQuizSetSnapshot', () => {
        it('the owner gets labels, questions in owner order with ids, answer letters and a sha256 content hash', async () => {
            const snap = await snapshot(teacher);
            expect(snap).toMatchObject({ schemaVersion: 1, quizSetId: set.id, ownerId: teacher.id });
            expect(snap.contentHash).toMatch(/^[0-9a-f]{64}$/);
            expect(Number.isNaN(Date.parse(snap.takenAt))).toBe(false);
            expect(snap.labels.map((l) => [l.name, l.order, l.color])).toEqual([
                ['Part A', 0, '#336699'],
                ['Part B', 1, '#336699'],
            ]);
            expect(snap.questions.map((q) => [q.id, q.order, q.answer, q.labelId])).toEqual([
                [set.questionIds[0], 0, 'A', set.labelIds.get('Part A')],
                [set.questionIds[1], 1, 'A', set.labelIds.get('Part A')],
                [set.questionIds[2], 2, 'C', set.labelIds.get('Part B')],
                [set.questionIds[3], 3, 'A', set.labelIds.get('Part B')],
                [set.questionIds[4], 4, 'A', undefined],
            ]);
            expect(snap.questions[0].options).toEqual(['a', 'b', 'c', 'd']);
        });

        it('a non-owner teacher gets NOT_FOUND, exactly like an id that does not exist', async () => {
            expect(await code(snapshot(otherTeacher))).toBe(status.NOT_FOUND);
            expect(await code(snapshot(teacher, `qs_${rid()}`))).toBe(status.NOT_FOUND);
        });

        it('no token is UNAUTHENTICATED; a student and a service token are PERMISSION_DENIED', async () => {
            expect(await code(lastValueFrom(t.contentGrpc.getQuizSetSnapshot({ quizSetId: set.id }, new Metadata())))).toBe(
                status.UNAUTHENTICATED
            );
            expect(await code(snapshot(student))).toBe(status.PERMISSION_DENIED);
            const md = new Metadata();
            md.set('authorization', `Bearer ${await t.serviceToken('assessment')}`);
            expect(await code(lastValueFrom(t.contentGrpc.getQuizSetSnapshot({ quizSetId: set.id }, md)))).toBe(
                status.PERMISSION_DENIED
            );
        });

        it('a blank quiz_set_id is INVALID_ARGUMENT', async () => {
            expect(await code(snapshot(teacher, '  '))).toBe(status.INVALID_ARGUMENT);
        });
    });

    describe('GetQuizSetsByIds and the shared content hash', () => {
        it('with_content_hash returns the hash GetQuizSetSnapshot returns; without it there is none', async () => {
            const snap = await snapshot(teacher);
            const [withHash] = await summaries(teacher, [set.id], true);
            expect(withHash).toMatchObject({ id: set.id, contentHash: snap.contentHash });
            const [plain] = await summaries(teacher, [set.id], false);
            expect(plain.id).toBe(set.id);
            expect(plain.contentHash).toBeUndefined();
        });

        it('carries the question count, with and without the hash (the teacher room lists show it)', async () => {
            const [withHash] = await summaries(teacher, [set.id], true);
            const [plain] = await summaries(teacher, [set.id], false);
            expect(withHash.questionCount).toBe(set.questionIds.length);
            expect(plain.questionCount).toBe(set.questionIds.length);
            const empty = (await seedQuizSet(t, teacher.id)).id;
            await t.prisma.detailsQuizQuestion.deleteMany({ where: { quizSetId: empty } });
            expect((await summaries(teacher, [empty], false))[0].questionCount).toBe(0);
        });

        it('only the caller\'s sets come back; foreign and missing ids are omitted', async () => {
            const theirs = (await seedQuizSet(t, otherTeacher.id)).id;
            const mine = await summaries(teacher, [set.id, theirs, `qs_${rid()}`], false);
            expect(mine.map((s) => s.id)).toEqual([set.id]);
            expect(await summaries(otherTeacher, [set.id], true)).toEqual([]);
        });

        it('equal content, equal hash; a question edit changes it in both RPCs; a title edit does not', async () => {
            const own = await seedQuizSetWithContent(t, teacher.id, ['L'], [{ question: 'Before', label: 'L' }, { question: 'Two' }]);
            const first = (await snapshot(teacher, own.id)).contentHash;
            expect((await summaries(teacher, [own.id], true))[0].contentHash).toBe(first);
            expect((await snapshot(teacher, own.id)).contentHash).toBe(first);

            await t.prisma.quizSet.update({ where: { id: own.id }, data: { title: 'A new title' } });
            expect((await snapshot(teacher, own.id)).contentHash).toBe(first);

            await t.prisma.quizQuestion.update({ where: { id: own.questionIds[0] }, data: { question: 'After' } });
            const edited = (await snapshot(teacher, own.id)).contentHash;
            expect(edited).not.toBe(first);
            expect((await summaries(teacher, [own.id], true))[0].contentHash).toBe(edited);
        });

        it('more than 50 ids is INVALID_ARGUMENT; no token is UNAUTHENTICATED', async () => {
            const ids = Array.from({ length: 51 }, (_, i) => `x${i}`);
            expect(await code(summaries(teacher, ids, false))).toBe(status.INVALID_ARGUMENT);
            expect(await code(lastValueFrom(t.contentGrpc.getQuizSetsByIds({ ids: [], withContentHash: false }, new Metadata())))).toBe(
                status.UNAUTHENTICATED
            );
        });
    });

    describe('GetUserContentStats', () => {
        it('counts the caller\'s own quiz sets and flashcard sets (students see zeros); no token is UNAUTHENTICATED', async () => {
            const owner = await t.createUser(['TEACHER']);
            await seedQuizSet(t, owner.id);
            await seedQuizSet(t, owner.id);
            await t.prisma.flashCardSet.create({ data: { id: `fs_${rid()}`, title: 'f', userId: owner.id } });
            const stats = await lastValueFrom(t.contentGrpc.getUserContentStats({}, await t.md(owner)));
            expect(stats).toEqual({ quizSetCount: 2, flashcardSetCount: 1 });
            const none = await lastValueFrom(t.contentGrpc.getUserContentStats({}, await t.md(student)));
            expect(none).toEqual({ quizSetCount: 0, flashcardSetCount: 0 });
            expect(await code(lastValueFrom(t.contentGrpc.getUserContentStats({}, new Metadata())))).toBe(status.UNAUTHENTICATED);
        });
    });
});
