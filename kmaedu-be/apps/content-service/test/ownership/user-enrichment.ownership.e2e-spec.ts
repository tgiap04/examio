import { bootContentApp, rid, type ContentTestApp, type TestUser } from './support/content-test-app';
import { call, keysDeep } from './support/http';
import { seedQuizSet } from './support/seed';

/**
 * content owns no user data: every user shown (set creator, sharing lists, search hits) comes from auth
 * through ONE batched profile call per request (Redis-cached), and no content response ever carries an
 * `email` key (RT-15). Real Postgres + Redis, real guards, a fake auth directory over real gRPC that fails
 * the test on any call other than `GetPublicProfilesByIds` / `SearchUsers`.
 */
describe('content user enrichment and email-leak contract (e2e)', () => {
    let t: ContentTestApp;
    let host: TestUser;
    let student: TestUser;
    let other: TestUser;
    let setId: string;
    let quizId: string;
    const tok: Record<string, string> = {};
    const nameOf = (u: TestUser) => `Name ${u.id}`;
    const get = (p: string, who: string) => call(t.server, 'get', p, tok[who]);

    /** Asserts the 200, no `email` key anywhere, and at most ONE profile batch for the request. */
    async function clean(who: string, path: string) {
        t.auth.reset();
        const res = await get(path, who);
        expect({ path, status: res.status }).toEqual({ path, status: 200 });
        expect({ path, hasEmail: keysDeep(res.body).has('email') }).toEqual({ path, hasEmail: false });
        expect(JSON.stringify(res.body)).not.toContain('@own.test');
        expect({ path, batches: t.auth.calls.profileBatches.length <= 1 }).toEqual({ path, batches: true });
        return res.body;
    }

    beforeAll(async () => {
        t = await bootContentApp();
        host = await t.createUser(['TEACHER']);
        student = await t.createUser(['STUDENT']);
        other = await t.createUser(['STUDENT']);
        for (const [k, u] of Object.entries({ host, student, other })) tok[k] = await t.tokenFor(u);
        setId = `fs_${rid()}`;
        await t.prisma.flashCardSet.create({
            data: { id: setId, title: 'set', userId: host.id, isPublic: true, whitelist: [student.id] } as never,
        });
        quizId = (await seedQuizSet(t, host.id, { isPublic: true, whitelist: [student.id] })).id;
    });
    afterAll(() => t.close());

    it('flashcards: study view, public info, sharing and the recent list use auth profiles without email', async () => {
        const study = await clean('student', `/flashcardsets/study/${setId}`);
        expect(study.creator).toMatchObject({ id: host.id, name: nameOf(host) });
        const info = await clean('student', `/flashcardsets/study/${setId}/info`);
        expect(info.creator.name).toBe(nameOf(host));
        const sharing = await clean('host', `/flashcardsets/${setId}/sharing`);
        expect(sharing.whitelist.map((p: { id: string }) => p.id)).toEqual([student.id]);
        const recent = await clean('student', '/student/recent-flashcards?limit=10&page=1');
        expect(recent.flashcardSets.find((s: { id: string }) => s.id === setId).creator.name).toBe(nameOf(host));
    });

    it('quizzes: sharing list, practice catalogue and own lists carry no email, one profile batch at most', async () => {
        const sharing = await clean('host', `/quizsets/${quizId}/sharing`);
        expect(sharing.whitelist.map((p: { id: string }) => p.id)).toEqual([student.id]);
        await clean('student', '/quiz-practice/sets');
        await clean('host', '/quizsets');
        await clean('host', '/flashcardsets');
    });

    it('a second read of the same creator is served from the profile cache (no auth call)', async () => {
        await clean('student', `/flashcardsets/study/${setId}/info`);
        t.auth.reset();
        const again = await get(`/flashcardsets/study/${setId}/info`, 'student');
        expect(again.status).toBe(200);
        expect(t.auth.calls.profileBatches).toEqual([]);
    });

    it('a user auth does not know shows as null, the request still succeeds', async () => {
        const ghost = `u_${rid()}`;
        t.auth.addUser({ id: ghost, username: ghost, email: `${ghost}@own.test` });
        const ghostSet = `fs_${rid()}`;
        await t.prisma.flashCardSet.create({ data: { id: ghostSet, title: 'g', userId: ghost, isPublic: true } as never });
        t.auth.removeUser(ghost);
        const res = await call(t.server, 'get', `/flashcardsets/study/${ghostSet}/info`, tok.student);
        expect(res.status).toBe(200);
        expect(res.body.creator).toBeNull();
    });

    it('users/search goes to auth with the caller token, drops the caller, returns no email', async () => {
        t.auth.reset();
        const res = await call(t.server, 'get', `/flashcardsets/users/search?q=${other.id.slice(0, 6)}`, tok.host);
        expect(res.status).toBe(200);
        expect(res.body.map((p: { id: string }) => p.id)).toContain(other.id);
        expect(keysDeep(res.body).has('email')).toBe(false);
        expect(t.auth.calls.searches).toHaveLength(1);
        expect(t.auth.calls.searches[0].authorization).toBe(`Bearer ${tok.host}`);
    });
});
