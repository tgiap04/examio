import { appendCodeGranted, SHARE_LIST_CAP } from '../../src/modules/common/code-granted';
import { bootAssessmentApp, type AssessmentTestApp } from './support/assessment-test-app';
import { call } from './support/http';
import { seedExamRoom, seedExamSession } from './support/seed';
import { student as makeStudent, teacher as makeTeacher, type TokenUser } from './support/users';

const ids = (n: number, prefix = 'g') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe('exam session sharing: code memory, cap and whitelist ids (e2e)', () => {
    let t: AssessmentTestApp;
    let owner: TokenUser;
    let learner: TokenUser;
    let fellow: TokenUser;
    let sessionId: string;
    const run = (m: 'get' | 'post' | 'put', p: string, who: TokenUser, b?: object) =>
        call(t.server, m, p, who.token, b ?? (m === 'get' ? undefined : {}));
    const grants = async () => (await t.prisma.examSession.findUniqueOrThrow({ where: { id: sessionId } })).codeGrantedIds;

    beforeAll(async () => {
        t = await bootAssessmentApp();
        owner = await makeTeacher(t);
        learner = await makeStudent(t);
        fellow = await makeStudent(t);
        const room = await seedExamRoom(t, owner.id);
        sessionId = await seedExamSession(t, room.id, { assessType: 1, accessCode: '777123' });
    });
    afterAll(() => t?.close());

    describe('appendCodeGranted on Postgres', () => {
        const fresh = async (over: Partial<{ accessCode: string }> = {}) => {
            const room = await seedExamRoom(t, owner.id);
            const id = await seedExamSession(t, room.id, { assessType: 1, ...over });
            return id;
        };
        const ofSession = async (id: string) => (await t.prisma.examSession.findUniqueOrThrow({ where: { id } })).codeGrantedIds;

        it('concurrent unlocks of the same user add the id once', async () => {
            const id = await fresh();
            await Promise.all(Array.from({ length: 10 }, () => appendCodeGranted(t.prisma, id, 'same')));
            expect(await ofSession(id)).toEqual(['same']);
        });

        it('a code that rotated between the check and the write grants nothing (409 SHARING_CHANGED)', async () => {
            const id = await fresh({ accessCode: '222222' });
            await expect(appendCodeGranted(t.prisma, id, 'late', '111111')).rejects.toMatchObject({ status: 409 });
            expect(await ofSession(id)).toEqual([]);
            await expect(appendCodeGranted(t.prisma, id, 'ok', '222222')).resolves.toBeUndefined();
            expect(await ofSession(id)).toEqual(['ok']);
        });

        it('at the cap a new user is a 409, an existing one is fine, a missing session is a 404', async () => {
            const id = await fresh();
            await t.prisma.examSession.update({ where: { id }, data: { codeGrantedIds: ids(SHARE_LIST_CAP) } });
            await expect(appendCodeGranted(t.prisma, id, 'late')).rejects.toMatchObject({ status: 409 });
            await expect(appendCodeGranted(t.prisma, id, 'g0')).resolves.toBeUndefined();
            await expect(appendCodeGranted(t.prisma, 'missing', 'g0')).rejects.toMatchObject({ status: 404 });
        });
    });

    it('with-code remembers the user, a later study read needs no code', async () => {
        const study = () => run('get', `/examsessions/study/${sessionId}`, learner);
        expect((await study()).status).toBe(403);
        expect((await run('post', `/examsessions/study/${sessionId}/with-code`, learner, { accessCode: '777123' })).status).toBeLessThan(300);
        expect(await grants()).toEqual([learner.id]);
        expect((await study()).status).toBe(200);
    });

    it('exam attempt start with the right code remembers the user too', async () => {
        const res = await run('post', '/examattempts/start', fellow, { examSessionId: sessionId, accessCode: '777123' });
        expect(res.status).toBeLessThan(300);
        expect((await grants()).sort()).toEqual([learner.id, fellow.id].sort());
    });

    it('generate-code and a changed accessCode (PUT :id, PUT :id/sharing) clear codeGrantedIds; the same code does not', async () => {
        await run('post', `/examsessions/${sessionId}/generate-code`, owner);
        expect(await grants()).toEqual([]);
        const set = (data: object) => t.prisma.examSession.update({ where: { id: sessionId }, data });
        await set({ accessCode: '888123', codeGrantedIds: [learner.id] });
        await run('put', `/examsessions/${sessionId}`, owner, { accessCode: '888123' });
        expect(await grants()).toEqual([learner.id]);
        await run('put', `/examsessions/${sessionId}`, owner, { accessCode: '999123' });
        expect(await grants()).toEqual([]);
        await set({ codeGrantedIds: [learner.id] });
        await run('put', `/examsessions/${sessionId}/sharing`, owner, { isPublic: false, accessCode: '999123', whitelist: [] });
        expect(await grants()).toEqual([learner.id]);
        await run('put', `/examsessions/${sessionId}/sharing`, owner, { isPublic: false, accessCode: null, whitelist: [] });
        expect(await grants()).toEqual([]);
    });

    it('PUT :id/sharing keeps a full-replace whitelist but refuses more than 2000 ids (409 SHARE_LIST_FULL)', async () => {
        const over = await run('put', `/examsessions/${sessionId}/sharing`, owner, {
            isPublic: false,
            accessCode: null,
            whitelist: ids(SHARE_LIST_CAP + 1),
        });
        expect(over.status).toBe(409);
        expect(over.body.code).toBe('SHARE_LIST_FULL');
        const ok = await run('put', `/examsessions/${sessionId}/sharing`, owner, {
            isPublic: false,
            accessCode: null,
            whitelist: [learner.id],
        });
        expect(ok.status).toBe(200);
    });

    describe('whitelist ids are validated before storage (create, PUT :id, PUT :id/sharing)', () => {
        const tooLong = 'x'.repeat(65);
        it.each([
            ['an empty id', ['']],
            ['an id above 64 characters', [tooLong]],
            ['a number', [42]],
        ])('%s -> 400 and nothing stored', async (_name, whitelist) => {
            const before = await grants();
            expect((await run('put', `/examsessions/${sessionId}`, owner, { whitelist })).status).toBe(400);
            expect((await run('put', `/examsessions/${sessionId}/sharing`, owner, { isPublic: false, whitelist })).status).toBe(400);
            const room = await seedExamRoom(t, owner.id);
            const created = await run('post', '/examsessions', owner, {
                examRoomId: room.id,
                startTime: new Date(Date.now() + 3_600_000).toISOString(),
                whitelist,
            });
            expect(created.status).toBe(400);
            expect(await grants()).toEqual(before);
            expect((await t.prisma.examSession.findUniqueOrThrow({ where: { id: sessionId } })).whitelist).not.toContain(tooLong);
        });
    });
});
