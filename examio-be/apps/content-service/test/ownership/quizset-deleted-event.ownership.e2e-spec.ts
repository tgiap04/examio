import { R2DeleteTaskWriter } from '@examio/messaging';
import { bootContentApp, rid, type ContentTestApp, type TestUser } from './support/content-test-app';
import { call } from './support/http';
import { seedQuizSet } from './support/seed';

/** `content.quizset.deleted` is written to the outbox in the very transaction of the delete. */
describe('content.quizset.deleted outbox event (e2e)', () => {
    let t: ContentTestApp;
    let owner: TestUser;
    let other: TestUser;
    let token: string;

    beforeAll(async () => {
        t = await bootContentApp();
        owner = await t.createUser(['TEACHER']);
        other = await t.createUser(['TEACHER']);
        token = await t.tokenFor(owner);
    });
    afterAll(() => t?.close());

    const events = async (quizSetId: string) =>
        (await t.prisma.outboxEvent.findMany({ where: { type: 'content.quizset.deleted' } })).filter((row) =>
            (row.envelope as { data: { quizSetIds: string[] } }).data.quizSetIds.includes(quizSetId)
        );

    it('deleting a set removes the row and writes ONE outbox event {quizSetIds, ownerId} with source=content', async () => {
        const { id } = await seedQuizSet(t, owner.id);
        const res = await call(t.server, 'delete', `/quizsets/${id}`, token);
        expect(res.status).toBe(200);
        expect(await t.prisma.quizSet.findUnique({ where: { id } })).toBeNull();
        const rows = await events(id);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ source: 'content', publishedAt: null });
        expect(rows[0].envelope).toMatchObject({
            type: 'content.quizset.deleted',
            source: 'content',
            version: 1,
            data: { quizSetIds: [id], ownerId: owner.id },
        });
    });

    it('a failed transaction leaves the set AND no event (nothing is announced for a set that still exists)', async () => {
        const { id } = await seedQuizSet(t, owner.id);
        // every module provides its own writer instance: fail the shared prototype method
        const spy = jest.spyOn(R2DeleteTaskWriter.prototype, 'enqueue').mockRejectedValueOnce(new Error('boom'));
        try {
            const res = await call(t.server, 'delete', `/quizsets/${id}`, token);
            expect(res.status).toBeGreaterThanOrEqual(500);
        } finally {
            spy.mockRestore();
        }
        expect(await t.prisma.quizSet.findUnique({ where: { id } })).not.toBeNull();
        expect(await events(id)).toHaveLength(0);
    });

    it('someone else\'s set (404) and a missing set announce nothing', async () => {
        const { id } = await seedQuizSet(t, owner.id);
        const res = await call(t.server, 'delete', `/quizsets/${id}`, await t.tokenFor(other));
        expect(res.status).toBe(404);
        expect((await call(t.server, 'delete', `/quizsets/qs_${rid()}`, token)).status).toBe(404);
        expect(await events(id)).toHaveLength(0);
        expect(await t.prisma.quizSet.findUnique({ where: { id } })).not.toBeNull();
    });
});
