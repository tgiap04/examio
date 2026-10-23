import { bootExamApp, rid, type ExamTestApp, type TestUser } from './support/exam-test-app';
import { call, keysDeep } from './support/http';
import { seedAttempt, seedExamRoom, seedExamSession } from './support/seed';

/**
 * exam owns no user data: every user/host shown comes from auth through ONE
 * batched profile call per request (Redis-cached), and no exam response ever
 * carries an `email` key (RT-15). Real Postgres + Redis, real guards, a fake
 * auth directory over real gRPC.
 */
describe('exam user enrichment and email-leak contract (e2e)', () => {
    let t: ExamTestApp;
    let host: TestUser;
    let student: TestUser;
    let other: TestUser;
    let roomId: string;
    let sessionId: string;
    let attemptId: string;
    let setId: string;
    const tok: Record<string, string> = {};
    const nameOf = (u: TestUser) => `Name ${u.id}`;
    const get = (p: string, who: string) => call(t.server, 'get', p, tok[who]);

    /** Asserts the 200, no `email` key anywhere, and at most ONE profile batch for the request. */
    async function clean(who: string, path: string) {
        t.auth.reset();
        const res = await get(path, who);
        expect({ path, status: res.status }).toEqual({ path, status: 200 });
        expect({ path, hasEmail: keysDeep(res.body).has('email') }).toEqual({
            path,
            hasEmail: false,
        });
        expect(JSON.stringify(res.body)).not.toContain('@own.test');
        expect({ path, batches: t.auth.calls.profileBatches.length <= 1 }).toEqual({
            path,
            batches: true,
        });
        return res.body;
    }

    beforeAll(async () => {
        t = await bootExamApp();
        host = await t.createUser(['TEACHER']);
        student = await t.createUser(['STUDENT']);
        other = await t.createUser(['STUDENT']);
        for (const [k, u] of Object.entries({ host, student, other })) {
            tok[k] = await t.tokenFor(u);
        }
        roomId = (await seedExamRoom(t, host.id)).id;
        sessionId = await seedExamSession(t, roomId, { assessType: 0 });
        attemptId = await seedAttempt(t, sessionId, student.id, 1);
        await seedAttempt(t, sessionId, other.id, 1);
        setId = `fs_${rid()}`;
        await t.prisma.flashCardSet.create({
            data: {
                id: setId,
                title: 'set',
                userId: host.id,
                isPublic: true,
                whitelist: [student.id],
            } as never,
        });
    });
    afterAll(() => t.close());

    it('exam rooms: host display data is the auth profile, never an email', async () => {
        const detail = await clean('host', `/examrooms/detail/${roomId}`);
        expect(detail.host).toEqual({
            id: host.id,
            username: host.id,
            name: nameOf(host),
            avatar: null,
        });
        const body = await call(t.server, 'put', `/examrooms/${roomId}`, tok.host, {
            title: 'renamed',
        });
        expect(body.status).toBe(200);
        expect(keysDeep(body.body).has('email')).toBe(false);
        expect(body.body.examRoom.host.name).toBe(nameOf(host));
        const teaser = await get(`/examrooms/get-public/${roomId}`, 'student');
        expect(teaser.status).toBe(200);
        expect(teaser.body.host).toEqual({ name: nameOf(host), avatar: null });
        expect(keysDeep(teaser.body).has('email')).toBe(false);
    });

    it('exam sessions: by-id, study view and public info carry the host from auth', async () => {
        const byId = await clean('host', `/examsessions/get-by-id/${sessionId}`);
        expect(byId.examRoom.host.name).toBe(nameOf(host));
        const study = await clean('student', `/examsessions/study/${sessionId}`);
        expect(study.creator.name).toBe(nameOf(host));
        const info = await clean('student', `/examsessions/study/${sessionId}/info`);
        expect(info.creator.name).toBe(nameOf(host));
        await clean('student', `/examsessions/get-public/${sessionId}`);
        await clean('host', `/examsessions/${sessionId}/sharing`);
    });

    it('attempts: lists enrich every examinee with ONE call, and a repeat is served from the cache', async () => {
        t.auth.reset();
        const byRoom = await get(`/examattempts/list-by-room/${roomId}?limit=10`, 'host');
        expect(byRoom.status).toBe(200);
        const names = byRoom.body.attempts.map((a: { user: { name: string } }) => a.user.name).sort();
        expect(names).toEqual([nameOf(student), nameOf(other)].sort());
        expect(keysDeep(byRoom.body).has('email')).toBe(false);
        expect(t.auth.calls.profileBatches.length).toBeLessThanOrEqual(1);

        await clean('host', `/examattempts/list-by-session/${sessionId}?limit=10`);
        await clean('host', `/examattempts/list-by-room/${roomId}?distinctUser=true`);
        const detail = await clean('host', `/examattempts/${attemptId}/detail`);
        expect(detail.user.name).toBe(nameOf(student));
        const own = await clean('student', `/examattempts/get-by-id/${attemptId}`);
        expect(own.user).toMatchObject({ id: student.id, name: nameOf(student) });
        await clean('student', `/examattempts/list`);

        // the same profiles again: every one is cached now -> zero profile RPCs
        t.auth.reset();
        const again = await get(`/examattempts/list-by-room/${roomId}?limit=10`, 'host');
        expect(again.status).toBe(200);
        expect(t.auth.calls.profileBatches).toEqual([]);
    });

    it('flashcards: study view, public info, sharing and the recent list use auth profiles without email', async () => {
        const study = await clean('student', `/flashcardsets/study/${setId}`);
        expect(study.creator).toMatchObject({ id: host.id, name: nameOf(host) });
        const info = await clean('student', `/flashcardsets/study/${setId}/info`);
        expect(info.creator.name).toBe(nameOf(host));
        const sharing = await clean('host', `/flashcardsets/${setId}/sharing`);
        expect(sharing.whitelist.map((p: { id: string }) => p.id)).toEqual([student.id]);
        const recent = await clean('student', '/student/recent-flashcards?limit=10&page=1');
        expect(recent.flashcardSets.find((s: { id: string }) => s.id === setId).creator.name).toBe(
            nameOf(host)
        );
    });

    it('a user auth does not know shows as null, the request still succeeds', async () => {
        const ghost = `u_${rid()}`;
        t.auth.addUser({ id: ghost, username: ghost, email: `${ghost}@own.test` });
        const ghostRoom = await seedExamRoom(t, ghost);
        t.auth.removeUser(ghost);
        const ghostToken = await t.tokenFor({ id: ghost, roles: ['TEACHER'], av: 0 });
        const res = await call(t.server, 'get', `/examrooms/detail/${ghostRoom.id}`, ghostToken);
        expect(res.status).toBe(200);
        expect(res.body.host).toBeNull();
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
