import {
    applySharingUpdate,
    appendCodeGranted,
    SHARE_LIST_CAP,
} from '../../src/modules/common/sharing-list.util';
import {
    bootExamApp,
    rid,
    type ExamTestApp,
    type TestUser,
} from './support/exam-test-app';
import { call } from './support/http';
import { seedExamRoom, seedExamSession, seedQuizSet } from './support/seed';

const ids = (n: number, prefix = 'g') =>
    Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const noDelta = {
    add: [] as string[],
    remove: [] as string[],
    removeCodeGranted: [] as string[],
    codeMode: 'keep' as const,
    newCode: '123456',
};

describe('sharing: ownership, deltas, cap and code memory (e2e)', () => {
    let t: ExamTestApp;
    let owner: TestUser;
    let otherTeacher: TestUser;
    let student: TestUser;
    let fellow: TestUser;
    const tok: Record<string, string> = {};
    let quizId: string;
    let cardSetId: string;
    const cardSet = async (over: object = {}) => {
        const id = `fs_${rid()}`;
        await t.prisma.flashCardSet.create({
            data: { id, title: id, userId: owner.id, ...over } as never,
        });
        const card = await t.prisma.flashCard.create({
            data: { id: `fc_${rid()}`, question: 'Q', answer: 'A' },
        });
        await t.prisma.detailsFlashCard.create({
            data: { flashCardSetId: id, flashCardId: card.id },
        });
        return id;
    };
    const run = (m: 'get' | 'post' | 'put', p: string, who?: string, b?: object) =>
        call(t.server, m, p, who ? tok[who] : undefined, b ?? (m === 'get' ? undefined : {}));

    beforeAll(async () => {
        t = await bootExamApp();
        owner = await t.createUser(['TEACHER']);
        otherTeacher = await t.createUser(['TEACHER']);
        student = await t.createUser(['STUDENT']);
        fellow = await t.createUser(['STUDENT']);
        for (const [k, u] of Object.entries({ owner, otherTeacher, student, fellow }))
            tok[k] = await t.tokenFor(u);
        quizId = (await seedQuizSet(t, owner.id)).id;
        cardSetId = await cardSet();
    });
    afterAll(() => t.close());

    describe.each([
        ['quizsets', () => quizId],
        ['flashcardsets', () => cardSetId],
    ])('/%s/:id sharing endpoints', (base, id) => {
        it('another TEACHER gets 404 on GET/PUT sharing and generate-code; STUDENT 403; anonymous 401', async () => {
            const p = `/${base}/${id()}`;
            for (const [m, path, body] of [
                ['get', `${p}/sharing`, undefined],
                ['put', `${p}/sharing`, { isPublic: true }],
                ['post', `${p}/generate-code`, undefined],
            ] as const) {
                expect((await run(m, path, 'otherTeacher', body)).status).toBe(404);
                expect((await run(m, path, 'student', body)).status).toBe(403);
                expect((await run(m, path, undefined, body)).status).toBe(401);
            }
            // nothing was changed by the refused PUT
            expect((await run('get', `${p}/sharing`, 'owner')).body.isPublic).toBe(false);
        });

        it('delta PUT: add, remove, isPublic keep both lists; response has people without email', async () => {
            const p = `/${base}/${id()}/sharing`;
            const added = await run('put', p, 'owner', { addUserIds: [student.id, fellow.id] });
            expect(added.status).toBe(200);
            expect(added.body.whitelist.map((u: { id: string }) => u.id).sort()).toEqual(
                [student.id, fellow.id].sort()
            );
            expect(Object.keys(added.body.whitelist[0]).sort()).toEqual(['avatar', 'id', 'name', 'username']);
            const pub = await run('put', p, 'owner', { isPublic: true });
            expect(pub.body.isPublic).toBe(true);
            expect(pub.body.whitelist).toHaveLength(2);
            const removed = await run('put', p, 'owner', { removeUserIds: [fellow.id], isPublic: false });
            expect(removed.body.whitelist.map((u: { id: string }) => u.id)).toEqual([student.id]);
            expect(JSON.stringify(removed.body)).not.toMatch(/email/);
        });

        it('validation: empty body, 2001 ids and a wrong type are 400', async () => {
            const p = `/${base}/${id()}/sharing`;
            expect((await run('put', p, 'owner', {})).status).toBe(400);
            expect((await run('put', p, 'owner', { addUserIds: ids(SHARE_LIST_CAP + 1) })).status).toBe(400);
            expect((await run('put', p, 'owner', { removeUserIds: ids(SHARE_LIST_CAP + 1) })).status).toBe(400);
            expect((await run('put', p, 'owner', { isPublic: 'yes' })).status).toBe(400);
        });

        it('codeEnabled on/off and rotate: remove of a code-granted user removes it from codeGrantedIds', async () => {
            const p = `/${base}/${id()}`;
            const on = await run('put', `${p}/sharing`, 'owner', { codeEnabled: true });
            expect(on.body.accessCode).toMatch(/^\d{6}$/);
            const table = base === 'quizsets' ? 'quizSet' : 'flashCardSet';
            const key = base === 'quizsets' ? quizId : cardSetId;
            await (t.prisma as never as Record<string, { update: (a: object) => Promise<unknown> }>)[
                table
            ].update({ where: { id: key }, data: { codeGrantedIds: [student.id, fellow.id] } });
            const view = await run('get', `${p}/sharing`, 'owner');
            expect(view.body.codeGranted).toHaveLength(2);
            const rem = await run('put', `${p}/sharing`, 'owner', { removeUserIds: [student.id] });
            expect(rem.body.codeGranted.map((u: { id: string }) => u.id)).toEqual([fellow.id]);
            const rot = await run('post', `${p}/generate-code`, 'owner');
            expect(rot.body.accessCode).toMatch(/^\d{6}$/);
            const after = await run('get', `${p}/sharing`, 'owner');
            expect(after.body.codeGranted).toEqual([]);
            expect(after.body.whitelist).toEqual([]); // the earlier remove took the student off both lists
            const off = await run('put', `${p}/sharing`, 'owner', { codeEnabled: false });
            expect(off.body).toMatchObject({ accessCode: null, codeGranted: [] });
        });
    });

    describe('removeCodeGrantedIds only touches the code-granted list', () => {
        it.each([
            ['quizsets', () => quizId, 'quizSet'],
            ['flashcardsets', () => cardSetId, 'flashCardSet'],
        ] as const)('%s: removing a code-granted user keeps their whitelist grant', async (base, id, table) => {
            const key = id();
            await (t.prisma as never as Record<string, { update: (a: object) => Promise<unknown> }>)[table].update({
                where: { id: key },
                data: { whitelist: [student.id, fellow.id], codeGrantedIds: [student.id, fellow.id] },
            });
            const res = await run('put', `/${base}/${key}/sharing`, 'owner', { removeCodeGrantedIds: [student.id] });
            expect(res.status).toBe(200);
            expect(res.body.whitelist.map((u: { id: string }) => u.id).sort()).toEqual([student.id, fellow.id].sort());
            expect(res.body.codeGranted.map((u: { id: string }) => u.id)).toEqual([fellow.id]);
            expect((await run('put', `/${base}/${key}/sharing`, 'owner', { removeCodeGrantedIds: ids(SHARE_LIST_CAP + 1) })).status).toBe(400);
        });

        it('a whitelisted student who enters the code stays whitelisted, is not added to the code list, and keeps access after a code-grant removal', async () => {
            const qs = (await seedQuizSet(t, owner.id, { accessCode: '482913', whitelist: [student.id] })).id;
            expect((await run('post', `/quiz-practice/sets/${qs}/unlock`, 'student', { code: '482913' })).status).toBe(200);
            const row = await t.prisma.quizSet.findUniqueOrThrow({ where: { id: qs } });
            expect(row.codeGrantedIds).toEqual([]);
            await run('put', `/quizsets/${qs}/sharing`, 'owner', { removeCodeGrantedIds: [student.id] });
            const sets = (await run('get', '/quiz-practice/sets', 'student')).body.sets as Array<{ id: string }>;
            expect(sets.some((s) => s.id === qs)).toBe(true);
        });
    });

    it('users/search on quizsets: TEACHER only, prefix match, no email, q under 3 chars is 400', async () => {
        const ok = await run('get', `/quizsets/users/search?q=${student.id.slice(0, 6)}`, 'owner');
        expect(ok.status).toBe(200);
        expect(ok.body.map((u: { id: string }) => u.id)).toContain(student.id);
        expect(JSON.stringify(ok.body)).not.toMatch(/email/);
        expect((await run('get', '/quizsets/users/search?q=ab', 'owner')).status).toBe(400);
        expect((await run('get', '/quizsets/users/search?q=abc', 'student')).status).toBe(403);
        expect((await run('get', '/quizsets/users/search?q=abc')).status).toBe(401);
    });

    describe('sharing-list util on Postgres', () => {
        it('concurrent delta adds keep every id (no lost update) and concurrent unlocks add once', async () => {
            const qs = (await seedQuizSet(t, owner.id)).id;
            const adds = ids(25, 'c');
            await Promise.all(
                adds.map((u) =>
                    applySharingUpdate(t.prisma, 'QuizSet', { ...noDelta, id: qs, ownerId: owner.id, add: [u] })
                )
            );
            await Promise.all(Array.from({ length: 10 }, () => appendCodeGranted(t.prisma, 'QuizSet', qs, 'same')));
            const row = await t.prisma.quizSet.findUniqueOrThrow({ where: { id: qs } });
            expect([...row.whitelist].sort()).toEqual([...adds].sort());
            expect(row.codeGrantedIds).toEqual(['same']);
        });

        it('a delta that ends above 2000 is a 409 SHARE_LIST_FULL and changes nothing', async () => {
            const qs = (await seedQuizSet(t, owner.id, { whitelist: ids(SHARE_LIST_CAP - 1) })).id;
            const full = await run('put', `/quizsets/${qs}/sharing`, 'owner', { addUserIds: [student.id, fellow.id] });
            expect(full.status).toBe(409);
            expect(full.body.code).toBe('SHARE_LIST_FULL');
            expect((await t.prisma.quizSet.findUniqueOrThrow({ where: { id: qs } })).whitelist).toHaveLength(SHARE_LIST_CAP - 1);
            const exact = await run('put', `/quizsets/${qs}/sharing`, 'owner', { addUserIds: [student.id] });
            expect(exact.status).toBe(200);
            // remove + add in one call nets out under the cap
            const swap = await run('put', `/quizsets/${qs}/sharing`, 'owner', { addUserIds: [fellow.id], removeUserIds: [student.id] });
            expect(swap.status).toBe(200);
        });

        it('a code that rotated between the check and the write grants nothing (409 SHARING_CHANGED)', async () => {
            const qs = (await seedQuizSet(t, owner.id, { accessCode: '222222' })).id;
            await expect(appendCodeGranted(t.prisma, 'QuizSet', qs, 'late', '111111')).rejects.toMatchObject({ status: 409 });
            expect((await t.prisma.quizSet.findUniqueOrThrow({ where: { id: qs } })).codeGrantedIds).toEqual([]);
            await expect(appendCodeGranted(t.prisma, 'QuizSet', qs, 'ok', '222222')).resolves.toBeUndefined();
            expect((await t.prisma.quizSet.findUniqueOrThrow({ where: { id: qs } })).codeGrantedIds).toEqual(['ok']);
        });

        it('appending a code-granted user at the cap is a 409, an existing user is still fine', async () => {
            const qs = (await seedQuizSet(t, owner.id, { codeGrantedIds: ids(SHARE_LIST_CAP) })).id;
            await expect(appendCodeGranted(t.prisma, 'QuizSet', qs, 'late')).rejects.toMatchObject({ status: 409 });
            await expect(appendCodeGranted(t.prisma, 'QuizSet', qs, 'g0')).resolves.toBeUndefined();
            await expect(appendCodeGranted(t.prisma, 'QuizSet', 'missing', 'g0')).rejects.toMatchObject({ status: 404 });
        });
    });

    describe('flashcard code memory', () => {
        it('with-code remembers the user; the next visit needs no code; rotating brings the prompt back', async () => {
            const id = await cardSet({ accessCode: '555123' });
            const study = () => run('get', `/flashcardsets/study/${id}`, 'student');
            const before = await study();
            expect(before.status).toBe(403);
            expect(before.body.code).toBe('CODE_REQUIRED');
            expect((await run('post', `/flashcardsets/study/${id}/with-code`, 'student', { accessCode: '555123' })).status).toBeLessThan(300);
            expect((await study()).status).toBe(200);
            expect((await run('get', `/flashcardsets/${id}/sharing`, 'owner')).body.codeGranted.map((u: { id: string }) => u.id)).toEqual([student.id]);
            await run('post', `/flashcardsets/${id}/generate-code`, 'owner');
            expect((await study()).status).toBe(403);
        });
    });

    describe('exam session code memory and cap', () => {
        let sessionId: string;
        beforeAll(async () => {
            const room = await seedExamRoom(t, owner.id);
            sessionId = await seedExamSession(t, room.id, { assessType: 1, accessCode: '777123' });
        });
        const grants = async () =>
            (await t.prisma.examSession.findUniqueOrThrow({ where: { id: sessionId } })).codeGrantedIds;

        it('with-code remembers the user, a later study read needs no code', async () => {
            const study = () => run('get', `/examsessions/study/${sessionId}`, 'student');
            expect((await study()).status).toBe(403);
            expect((await run('post', `/examsessions/study/${sessionId}/with-code`, 'student', { accessCode: '777123' })).status).toBeLessThan(300);
            expect(await grants()).toEqual([student.id]);
            expect((await study()).status).toBe(200);
        });

        it('exam attempt start with the right code remembers the user too', async () => {
            const res = await run('post', '/examattempts/start', 'fellow', { examSessionId: sessionId, accessCode: '777123' });
            expect(res.status).toBeLessThan(300);
            expect((await grants()).sort()).toEqual([student.id, fellow.id].sort());
        });

        it('generate-code and a changed accessCode (PUT :id, PUT :id/sharing) clear codeGrantedIds; the same code does not', async () => {
            await run('post', `/examsessions/${sessionId}/generate-code`, 'owner');
            expect(await grants()).toEqual([]);
            const set = (data: object) => t.prisma.examSession.update({ where: { id: sessionId }, data });
            await set({ accessCode: '888123', codeGrantedIds: [student.id] });
            await run('put', `/examsessions/${sessionId}`, 'owner', { accessCode: '888123' });
            expect(await grants()).toEqual([student.id]);
            await run('put', `/examsessions/${sessionId}`, 'owner', { accessCode: '999123' });
            expect(await grants()).toEqual([]);
            await set({ codeGrantedIds: [student.id] });
            await run('put', `/examsessions/${sessionId}/sharing`, 'owner', { isPublic: false, accessCode: '999123', whitelist: [] });
            expect(await grants()).toEqual([student.id]);
            await run('put', `/examsessions/${sessionId}/sharing`, 'owner', { isPublic: false, accessCode: null, whitelist: [] });
            expect(await grants()).toEqual([]);
        });

        it('PUT :id/sharing keeps a full-replace whitelist but refuses more than 2000 ids (409 SHARE_LIST_FULL)', async () => {
            const over = await run('put', `/examsessions/${sessionId}/sharing`, 'owner', {
                isPublic: false,
                accessCode: null,
                whitelist: ids(SHARE_LIST_CAP + 1),
            });
            expect(over.status).toBe(409);
            expect(over.body.code).toBe('SHARE_LIST_FULL');
            const ok = await run('put', `/examsessions/${sessionId}/sharing`, 'owner', {
                isPublic: false,
                accessCode: null,
                whitelist: [student.id],
            });
            expect(ok.status).toBe(200);
        });
    });
});
