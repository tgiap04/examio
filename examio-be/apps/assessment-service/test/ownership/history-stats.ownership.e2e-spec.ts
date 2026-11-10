import { call } from './support/http';
import { bootAssessmentApp, type AssessmentTestApp } from './support/assessment-test-app';
import { seedQuizSet } from './support/seed';
import { student } from './support/users';

describe('GET /examattempts/history-stats (e2e)', () => {
    let t: AssessmentTestApp;

    beforeAll(async () => {
        t = await bootAssessmentApp();
    });
    afterAll(() => t?.close());

    it('counts come from content (quiz sets, flashcard sets) and document (files) as the caller; the second call is served from the cache', async () => {
        // a demoted teacher: the sets they authored are still counted, and the token is a student's (`exam:take`)
        const owner = await student(t);
        await seedQuizSet(t, owner.id);
        await seedQuizSet(t, owner.id);
        t.document.quotaFileCount.set(owner.id, 7);
        const since = t.document.calls.length;

        const first = await call(t.server, 'get', '/examattempts/history-stats', owner.token);
        const second = await call(t.server, 'get', '/examattempts/history-stats', owner.token);

        expect(first.status).toBe(200);
        expect(first.body).toEqual({ totalPDFs: 7, examsCreated: 2, flashcardSets: 0, totalStudyHours: 0 });
        expect(second.body).toEqual(first.body);
        const quota = t.document.calls.slice(since).filter((c) => c.rpc === 'GetQuota');
        expect(quota).toEqual([expect.objectContaining({ caller: owner.id })]);
    });

    it('a student sees zero created sets (content answers for any verified user)', async () => {
        const learner = await student(t);
        const res = await call(t.server, 'get', '/examattempts/history-stats', learner.token);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ examsCreated: 0, flashcardSets: 0 });
    });

    it('without document-service the field is null (not 0) and the incomplete result is not cached', async () => {
        const learner = await student(t);
        t.document.quotaFileCount.set(learner.id, 3);
        for (let i = 0; i < 3; i++) t.document.fault('GetQuota', 14, 'down'); // retried on UNAVAILABLE

        const degraded = await call(t.server, 'get', '/examattempts/history-stats', learner.token);
        expect(degraded.status).toBe(200);
        expect(degraded.body).toMatchObject({ totalPDFs: null, examsCreated: 0 });

        const recovered = await call(t.server, 'get', '/examattempts/history-stats', learner.token);
        expect(recovered.body).toMatchObject({ totalPDFs: 3 });
    });

    it('anonymous is 401', async () => {
        expect((await call(t.server, 'get', '/examattempts/history-stats')).status).toBe(401);
    });
});
