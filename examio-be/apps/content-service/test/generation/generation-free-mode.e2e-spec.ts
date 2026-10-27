import { connectAsAi, eventually, type TestPublisher } from '../ownership/support/broker';
import { ageJob, bootContentApp, call, generate, jobRow, outboxFor, reap, teacher, type ContentTestApp } from './support';

/** AI_FREE_MODE (dev only): jobs run without any finance call, on every path including refunds. */
describe('generation with AI_FREE_MODE=true (e2e)', () => {
    let t: ContentTestApp;
    let ai: TestPublisher;

    beforeAll(async () => {
        t = await bootContentApp({ freeMode: true });
        ai = await connectAsAi();
    });
    afterAll(async () => {
        await ai?.close();
        await t?.close();
    });

    it('queues the job without a Debit, and a failed / cancelled job makes no Refund call either', async () => {
        const user = await teacher(t, 10);
        const first = await generate(t, user, { bytes: 3 * 1024 * 1024 });
        expect(first.status).toBe(201);
        expect(await jobRow(t, first.body.jobId)).toMatchObject({ status: 'QUEUED', chargedAmount: 7 });
        expect(await outboxFor(t, 'content.generation.requested', first.body.jobId)).toHaveLength(1);

        await ai.publish('ai.generation.failed', { jobId: first.body.jobId, reason: 'GENERATION_FAILED' });
        await eventually(async () => (await jobRow(t, first.body.jobId)).refundedAt);

        const second = await generate(t, user, { typeResult: '2' });
        expect((await call(t.server, 'delete', `/ai/job/${second.body.jobId}`, user.token)).status).toBe(200);
        expect((await jobRow(t, second.body.jobId)).refundedAt).not.toBeNull();

        // a stuck PENDING_CHARGE job is reaped without finance too
        const stuck = await generate(t, user, { typeResult: '2', filename: 'stuck.pdf' });
        await t.prisma.generationJob.update({ where: { id: stuck.body.jobId }, data: { status: 'PENDING_CHARGE' } });
        await ageJob(t, stuck.body.jobId, 11);
        await reap(t);
        expect(await jobRow(t, stuck.body.jobId)).toMatchObject({ status: 'CANCELLED' });

        expect(t.finance.calls.filter((c) => c.userId === user.id)).toEqual([]);
        expect(t.finance.balances.get(user.id)).toBe(10);
    });
});
