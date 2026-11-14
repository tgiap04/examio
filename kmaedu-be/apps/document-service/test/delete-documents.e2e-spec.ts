import { lastValueFrom } from 'rxjs';
import { OutboxService } from '@kmaedu/messaging';
import { bootDocumentApp, rid, type DocumentTestApp, type TestUser } from './support/document-test-app';
import { call, outbox, queuedKeys } from './support/helpers';

/**
 * One delete path for `DELETE /ai/upload/:id` and `DeleteDocuments`: rows gone, R2 keys queued in
 * `r2_delete_tasks` and one `document.deleted` outbox row, all in ONE transaction; idempotent.
 */
describe('DeleteDocuments (e2e)', () => {
    let t: DocumentTestApp;

    beforeAll(async () => {
        t = await bootDocumentApp();
    });
    afterAll(() => t.close());

    async function upload(user: TestUser) {
        const res = await call(t.server, 'post', '/ai/quick-upload', await t.tokenFor(user)).attach(
            'file',
            Buffer.alloc(512, 3),
            { filename: `f-${rid()}.pdf`, contentType: 'application/pdf' }
        );
        expect(res.status).toBe(201);
        const row = await t.prisma.userStorage.findUniqueOrThrow({ where: { id: res.body.userStorageId } });
        return { id: row.id, key: row.keyR2, filename: row.filename };
    }
    const deletedEvents = async (userId: string) =>
        (await outbox(t.prisma, 'document.deleted')).filter(
            (row) => (row.envelope as { data: { userId: string } }).data.userId === userId
        );
    const remove = async (user: TestUser, ids: string[]) =>
        lastValueFrom(t.grpc.deleteDocuments({ ids }, await t.md(user)));

    it('owned ids: rows gone, keys queued and ONE document.deleted outbox row, in the same transaction', async () => {
        const user = t.teacher();
        const [a, b] = [await upload(user), await upload(user)];

        const res = await remove(user, [a.id, b.id]);

        expect(res.deleted.map((d) => d.id).sort()).toEqual([a.id, b.id].sort());
        expect(res.deleted.find((d) => d.id === a.id)?.filename).toBe(a.filename);
        expect(res.notFoundIds).toEqual([]);
        expect(await t.prisma.userStorage.count({ where: { id: { in: [a.id, b.id] } } })).toBe(0);
        expect(await queuedKeys(t.prisma, [a.key, b.key])).toEqual([a.key, b.key].sort());
        const events = await deletedEvents(user.id);
        expect(events).toHaveLength(1);
        expect(events[0].envelope).toMatchObject({
            type: 'document.deleted',
            source: 'document',
            data: { userId: user.id, storageIds: expect.arrayContaining([a.id, b.id]) },
        });
        expect((events[0].envelope as { data: { storageIds: string[] } }).data.storageIds).toHaveLength(2);
    });

    it("mixed owned and foreign ids: the foreign one is reported in not_found_ids and left untouched", async () => {
        const owner = t.teacher();
        const other = t.teacher();
        const mine = await upload(owner);
        const theirs = await upload(other);

        const res = await remove(owner, [mine.id, theirs.id, `ghost_${rid()}`]);

        expect(res.deleted.map((d) => d.id)).toEqual([mine.id]);
        expect(res.notFoundIds).toHaveLength(2);
        expect(res.notFoundIds).toContain(theirs.id);
        expect(await t.prisma.userStorage.count({ where: { id: theirs.id } })).toBe(1);
        expect(await queuedKeys(t.prisma, [theirs.key])).toEqual([]);
        expect(await deletedEvents(other.id)).toHaveLength(0);
    });

    it('a second call is a no-op: every id is not_found, no new outbox row, no new task', async () => {
        const user = t.teacher();
        const doc = await upload(user);
        await remove(user, [doc.id]);
        const eventsBefore = (await deletedEvents(user.id)).length;
        const tasksBefore = await queuedKeys(t.prisma, [doc.key]);

        const again = await remove(user, [doc.id]);

        expect(again).toEqual({ deleted: [], notFoundIds: [doc.id] });
        expect(await deletedEvents(user.id)).toHaveLength(eventsBefore);
        expect(await queuedKeys(t.prisma, [doc.key])).toEqual(tasksBefore);
        expect((await remove(user, [])).deleted).toEqual([]);
    });

    it('a failure inside the transaction rolls everything back: rows stay, no task, no event', async () => {
        const user = t.teacher();
        const doc = await upload(user);
        const outboxService = t.moduleRef.get(OutboxService, { strict: false });
        const add = jest.spyOn(outboxService, 'add').mockRejectedValueOnce(new Error('outbox down'));

        await expect(remove(user, [doc.id])).rejects.toMatchObject({ code: 13 }); // INTERNAL
        add.mockRestore();

        expect(await t.prisma.userStorage.count({ where: { id: doc.id } })).toBe(1);
        expect(await queuedKeys(t.prisma, [doc.key])).toEqual([]);
        expect(await deletedEvents(user.id)).toHaveLength(0);
        // and the retry succeeds
        expect((await remove(user, [doc.id])).deleted).toHaveLength(1);
    });

    it('HTTP DELETE /ai/upload/:id has the same effects', async () => {
        const user = t.teacher();
        const doc = await upload(user);

        const res = await call(t.server, 'delete', `/ai/upload/${doc.id}`, await t.tokenFor(user));

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, message: 'Xóa thành công' });
        expect(await t.prisma.userStorage.count({ where: { id: doc.id } })).toBe(0);
        expect(await queuedKeys(t.prisma, [doc.key])).toEqual([doc.key]);
        const events = await deletedEvents(user.id);
        expect(events).toHaveLength(1);
        expect(events[0].envelope).toMatchObject({ data: { storageIds: [doc.id], userId: user.id } });
        expect((await call(t.server, 'delete', `/ai/upload/${doc.id}`, await t.tokenFor(user))).status).toBe(404);
    });

    it('a key outside the owner prefix is never queued for deletion (the row still goes)', async () => {
        const user = t.teacher();
        const foreignKey = `ai-uploads/someone-else/${rid()}.pdf`;
        const row = await t.prisma.userStorage.create({
            data: { id: `legacy_${rid()}`, userId: user.id, filename: 'x.pdf', url: 'u', mimetype: 'application/pdf', size: 1, keyR2: foreignKey, processingStatus: 'COMPLETED' },
        });

        expect((await remove(user, [row.id])).deleted).toHaveLength(1);
        expect(await queuedKeys(t.prisma, [foreignKey])).toEqual([]);
    });

    it('every row of the owner is deletable by id whatever its status (no hidden charge rows any more)', async () => {
        const user = t.teacher();
        const rows = await Promise.all(
            ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'].map((processingStatus) =>
                t.prisma.userStorage.create({
                    data: { id: `st_${rid()}`, userId: user.id, filename: 'x.pdf', url: 'u', mimetype: 'application/pdf', size: 1, keyR2: `ai-uploads/${user.id}/${rid()}.pdf`, processingStatus },
                })
            )
        );
        const ids = rows.map((r) => r.id);
        const res = await remove(user, ids);
        expect(res.deleted.map((d) => d.id).sort()).toEqual([...ids].sort());
        expect(res.notFoundIds).toEqual([]);
        expect(await t.prisma.userStorage.count({ where: { id: { in: ids } } })).toBe(0);
    });

    it('more than 1000 ids is INVALID_ARGUMENT; a STUDENT and a service token are PERMISSION_DENIED', async () => {
        const user = t.teacher();
        await expect(remove(user, Array.from({ length: 1001 }, (_, i) => `id${i}`))).rejects.toMatchObject({ code: 3 });
        await expect(remove(t.user(['STUDENT']), ['x'])).rejects.toMatchObject({ code: 7 });
        const md = await t.md(user);
        md.set('authorization', `Bearer ${await t.serviceToken('exam', 'document')}`);
        await expect(lastValueFrom(t.grpc.deleteDocuments({ ids: ['x'] }, md))).rejects.toMatchObject({ code: 7 });
    });
});
