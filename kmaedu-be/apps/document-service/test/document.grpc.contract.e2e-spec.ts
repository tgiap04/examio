import { Metadata } from '@grpc/grpc-js';
import { lastValueFrom } from 'rxjs';
import { documentV1 } from '@kmaedu/contracts';
import { bootDocumentApp, rid, type DocumentTestApp, type TestUser } from './support/document-test-app';
import { call, outbox, outboxFor } from './support/helpers';

const Status = documentV1.DocumentProcessingStatus;

/**
 * DocumentService behind its real gRPC server and real Postgres: the caller is the `sub` of the
 * forwarded user token, a row that is not the caller's is NOT_FOUND, never PERMISSION_DENIED.
 */
describe('DocumentService gRPC contract (e2e)', () => {
    let t: DocumentTestApp;

    beforeAll(async () => {
        t = await bootDocumentApp();
    });
    afterAll(() => t.close());

    const create = async (user: TestUser, over: Partial<documentV1.CreateUploadRequest> = {}) =>
        lastValueFrom(
            t.grpc.createUpload(
                {
                    filename: `grpc-${rid()}.pdf`,
                    mimetype: 'application/pdf',
                    data: Buffer.alloc(1024, 9),
                    reuseDuplicate: false,
                    ...over,
                },
                await t.md(user)
            )
        );
    async function quickRow(user: TestUser) {
        const res = await call(t.server, 'post', '/ai/quick-upload', await t.tokenFor(user)).attach('file', Buffer.alloc(64, 1), {
            filename: `q-${rid()}.pdf`,
            contentType: 'application/pdf',
        });
        return res.body.userStorageId as string;
    }

    describe('CreateUpload', () => {
        it('reuse_duplicate: an existing (filename, size) upload comes back as reused, with no R2 upload and no new event', async () => {
            const user = t.teacher();
            const first = await create(user, { filename: 'same.pdf' });
            expect(first.reused).toBe(false);
            const uploads = t.r2.calls.filter((c) => c.rpc === 'UploadFile').length;

            const second = await create(user, { filename: 'same.pdf', reuseDuplicate: true });

            expect(second.reused).toBe(true);
            expect(second.document?.id).toBe(first.document?.id);
            expect(t.r2.calls.filter((c) => c.rpc === 'UploadFile')).toHaveLength(uploads);
            expect(await outboxFor(t.prisma, 'document.uploaded', first.document!.id)).toHaveLength(1);
        });

        it('reuse_duplicate matches on (userId, filename, size): another size or another user stores a new file', async () => {
            const user = t.teacher();
            const other = t.teacher();
            const first = await create(user, { filename: 'm.pdf' });
            const otherSize = await create(user, { filename: 'm.pdf', reuseDuplicate: true, data: Buffer.alloc(2048) });
            const otherUser = await create(other, { filename: 'm.pdf', reuseDuplicate: true });
            expect([otherSize.reused, otherUser.reused]).toEqual([false, false]);
            expect(new Set([first.document?.id, otherSize.document?.id, otherUser.document?.id]).size).toBe(3);
        });

        it('stores the file as svc:document, commits the row PENDING with document.uploaded; the response carries no charge flag', async () => {
            const user = t.teacher();
            const res = await create(user);
            const id = res.document!.id;

            expect(res.document).toEqual({
                id,
                userId: user.id,
                filename: expect.any(String),
                mimetype: 'application/pdf',
                size: '1024',
                keyR2: expect.stringMatching(new RegExp(`^ai-uploads/${user.id}/`)),
                url: expect.any(String),
                processingStatus: Status.DOCUMENT_PROCESSING_STATUS_PENDING,
                pageCount: 0,
                createdAt: expect.any(String),
                updatedAt: expect.any(String),
            });
            expect(await t.prisma.userStorage.findUniqueOrThrow({ where: { id } })).toMatchObject({ processingStatus: 'PENDING', queuedAt: expect.any(Date) });
            expect(await outboxFor(t.prisma, 'document.uploaded', id)).toHaveLength(1);
            expect(t.r2.calls.filter((c) => c.rpc === 'UploadFile' && c.keys[0].includes(`/${user.id}/`))).toEqual([
                expect.objectContaining({ caller: 'svc:document' }),
            ]);
        });

        it('there is no monthly quota: many uploads in one month are all accepted', async () => {
            const user = t.teacher();
            for (let i = 0; i < 7; i += 1) await expect(create(user)).resolves.toMatchObject({ reused: false });
        });

        it('rejects bad input and unauthorized callers', async () => {
            const user = t.teacher();
            await expect(create(user, { filename: ' ' })).rejects.toMatchObject({ code: 3 });
            await expect(create(user, { data: Buffer.alloc(0) })).rejects.toMatchObject({ code: 3 });
            await expect(lastValueFrom(t.grpc.createUpload({ filename: 'a', mimetype: 'b', data: Buffer.from('x'), reuseDuplicate: false }, new Metadata()))).rejects.toMatchObject({ code: 16 });
            await expect(create(t.user(['STUDENT']))).rejects.toMatchObject({ code: 7 });
            const service = await t.md(user);
            service.set('authorization', `Bearer ${await t.serviceToken('exam', 'document')}`);
            await expect(lastValueFrom(t.grpc.createUpload({ filename: 'a', mimetype: 'b', data: Buffer.from('x'), reuseDuplicate: false }, service))).rejects.toMatchObject({ code: 7 });
        });

        it('r2 refusing the upload is UNAVAILABLE and leaves no row and no event', async () => {
            const user = t.teacher();
            t.r2.failNextUpload.value = true;
            await expect(create(user)).rejects.toMatchObject({ code: 14 });
            expect(await t.prisma.userStorage.count({ where: { userId: user.id } })).toBe(0);
            expect((await outbox(t.prisma, 'document.uploaded')).filter((e) => JSON.stringify(e.envelope).includes(user.id))).toHaveLength(0);
        });
    });

    describe('ownership and lookups', () => {
        it('AssertOwnership: all owned is OK (empty too); one foreign or missing id is NOT_FOUND', async () => {
            const owner = t.teacher();
            const other = t.teacher();
            const [a, b] = [await quickRow(owner), await quickRow(owner)];
            const theirs = await quickRow(other);
            const md = await t.md(owner);

            await expect(lastValueFrom(t.grpc.assertOwnership({ ids: [a, b] }, md))).resolves.toEqual({});
            await expect(lastValueFrom(t.grpc.assertOwnership({ ids: [] }, md))).resolves.toEqual({});
            await expect(lastValueFrom(t.grpc.assertOwnership({ ids: [a, theirs] }, md))).rejects.toMatchObject({ code: 5 });
            await expect(lastValueFrom(t.grpc.assertOwnership({ ids: [a, 'missing'] }, md))).rejects.toMatchObject({ code: 5 });
            await expect(lastValueFrom(t.grpc.assertOwnership({ ids: [a, a, b] }, md))).resolves.toEqual({}); // duplicates are fine
        });

        it('GetDocumentsByIds for N ids is ONE query and returns only the caller-owned rows', async () => {
            const owner = t.teacher();
            const other = t.teacher();
            const mine = await Promise.all(Array.from({ length: 12 }, () => quickRow(owner)));
            const theirs = await quickRow(other);
            const findMany = jest.spyOn(t.prisma.userStorage, 'findMany');
            const others = [jest.spyOn(t.prisma.userStorage, 'findFirst'), jest.spyOn(t.prisma.userStorage, 'findUnique'), jest.spyOn(t.prisma.userStorage, 'count')];
            const raw = jest.spyOn(t.prisma, '$queryRaw');

            const res = await lastValueFrom(t.grpc.getDocumentsByIds({ ids: [...mine, theirs, 'nope'] }, await t.md(owner)));

            expect(findMany).toHaveBeenCalledTimes(1);
            expect(others.map((s) => s.mock.calls.length)).toEqual([0, 0, 0]);
            expect(raw).not.toHaveBeenCalled();
            expect(res.documents.map((d) => d.id).sort()).toEqual([...mine].sort());
            [findMany, raw, ...others].forEach((s) => s.mockRestore());
        });

        it('AssertOwnership is one query too', async () => {
            const owner = t.teacher();
            const ids = await Promise.all(Array.from({ length: 6 }, () => quickRow(owner)));
            const findMany = jest.spyOn(t.prisma.userStorage, 'findMany');
            await lastValueFrom(t.grpc.assertOwnership({ ids }, await t.md(owner)));
            expect(findMany).toHaveBeenCalledTimes(1);
            findMany.mockRestore();
        });
    });

    describe('GetQuota', () => {
        it('reports this month and the all-time count (no limit field); a STUDENT may ask for their own', async () => {
            const user = t.teacher();
            await quickRow(user);
            await quickRow(user);
            // a file from last month: counts in file_count, not in used_this_month
            await t.prisma.userStorage.create({
                data: { id: `old_${rid()}`, userId: user.id, filename: 'old.pdf', url: 'u', mimetype: 'application/pdf', size: 1, keyR2: `ai-uploads/${user.id}/${rid()}.pdf`, processingStatus: 'COMPLETED', createdAt: new Date(Date.now() - 62 * 24 * 3600 * 1000) },
            });

            expect(await lastValueFrom(t.grpc.getQuota({}, await t.md(user)))).toEqual({ usedThisMonth: 2, fileCount: 3 });

            const student = t.user(['STUDENT']);
            expect(await lastValueFrom(t.grpc.getQuota({}, await t.md(student)))).toMatchObject({ usedThisMonth: 0, fileCount: 0 });
        });

        it('does not accept an anonymous caller or a service token', async () => {
            await expect(lastValueFrom(t.grpc.getQuota({}, new Metadata()))).rejects.toMatchObject({ code: 16 });
            const md = new Metadata();
            md.set('authorization', `Bearer ${await t.serviceToken('exam', 'document')}`);
            await expect(lastValueFrom(t.grpc.getQuota({}, md))).rejects.toMatchObject({ code: 7 });
        });
    });

    describe('ListDocuments', () => {
        const list = async (user: TestUser, req: documentV1.ListDocumentsRequest) =>
            lastValueFrom(t.grpc.listDocuments(req, await t.md(user)));

        it('pages the caller own documents newest first, in one query, and never shows another user a row', async () => {
            const owner = t.teacher();
            const intruder = t.teacher();
            const ids: string[] = [];
            for (let i = 0; i < 3; i++) ids.push(await quickRow(owner));
            await quickRow(intruder);

            const findMany = jest.spyOn(t.prisma.userStorage, 'findMany');
            const first = await list(owner, { page: 1, size: 2 });
            expect(findMany).toHaveBeenCalledTimes(1);
            findMany.mockRestore();

            expect(first.documents.map((d) => d.id)).toEqual([ids[2], ids[1]]);
            expect(first.documents[0]).toMatchObject({ userId: owner.id, processingStatus: Status.DOCUMENT_PROCESSING_STATUS_PENDING });
            expect((await list(owner, { page: 2, size: 2 })).documents.map((d) => d.id)).toEqual([ids[0]]);
            expect((await list(intruder, { page: 1, size: 10 })).documents).toHaveLength(1);
        });

        it('defaults to page 1 / size 10, caps size at 100 and refuses a STUDENT and a service token', async () => {
            const owner = t.teacher();
            await quickRow(owner);
            expect((await list(owner, { page: 0, size: 0 })).documents).toHaveLength(1);
            await expect(list(owner, { page: 1, size: 101 })).rejects.toMatchObject({ code: 3 });

            await expect(list(t.user(['STUDENT']), { page: 1, size: 10 })).rejects.toMatchObject({ code: 7 });
            const md = new Metadata();
            md.set('authorization', `Bearer ${await t.serviceToken('exam', 'document')}`);
            await expect(lastValueFrom(t.grpc.listDocuments({ page: 1, size: 10 }, md))).rejects.toMatchObject({ code: 7 });
            await expect(lastValueFrom(t.grpc.listDocuments({ page: 1, size: 10 }, new Metadata()))).rejects.toMatchObject({ code: 16 });
        });
    });

    describe('GetDownloadUrl', () => {
        const getUrl = async (user: TestUser, id: string) => lastValueFrom(t.grpc.getDownloadUrl({ id }, await t.md(user)));

        it('signs a 1 h GET for the owner only, without touching the row or the outbox', async () => {
            const owner = t.teacher();
            const id = await quickRow(owner);
            const before = await t.prisma.userStorage.findUniqueOrThrow({ where: { id } });

            const res = await getUrl(owner, id);

            expect(res.downloadUrl).toContain('https://r2.test/signed/');
            const left = Number(res.expiresAt) - Date.now();
            expect(left).toBeGreaterThan(3_500_000);
            expect(left).toBeLessThanOrEqual(3_600_000);
            expect(await t.prisma.userStorage.findUniqueOrThrow({ where: { id } })).toEqual(before);
            expect(await outboxFor(t.prisma, 'document.uploaded', id)).toHaveLength(0);
        });

        it('another user, a missing id and an empty id are NOT_FOUND / INVALID_ARGUMENT; STUDENT, service and anonymous callers are refused', async () => {
            const owner = t.teacher();
            const id = await quickRow(owner);
            await expect(getUrl(t.teacher(), id)).rejects.toMatchObject({ code: 5 });
            await expect(getUrl(owner, 'does-not-exist')).rejects.toMatchObject({ code: 5 });
            await expect(getUrl(owner, ' ')).rejects.toMatchObject({ code: 3 });
            await expect(getUrl(t.user(['STUDENT']), id)).rejects.toMatchObject({ code: 7 });
            const md = new Metadata();
            md.set('authorization', `Bearer ${await t.serviceToken('exam', 'document')}`);
            await expect(lastValueFrom(t.grpc.getDownloadUrl({ id }, md))).rejects.toMatchObject({ code: 7 });
            await expect(lastValueFrom(t.grpc.getDownloadUrl({ id }, new Metadata()))).rejects.toMatchObject({ code: 16 });
        });
    });

    describe('EnsureProcessed', () => {
        const ensure = async (user: TestUser, id: string) => lastValueFrom(t.grpc.ensureProcessed({ id }, await t.md(user)));

        it('a quick-upload (never queued) is queued once; asking again does not emit again', async () => {
            const user = t.teacher();
            const id = await quickRow(user);
            expect(await outboxFor(t.prisma, 'document.uploaded', id)).toHaveLength(0);

            const first = await ensure(user, id);
            expect(first.document).toMatchObject({ id, processingStatus: Status.DOCUMENT_PROCESSING_STATUS_PENDING });
            expect(await outboxFor(t.prisma, 'document.uploaded', id)).toHaveLength(1);
            await ensure(user, id);
            expect(await outboxFor(t.prisma, 'document.uploaded', id)).toHaveLength(1);
        });

        it('a FAILED document goes back to PENDING and is re-announced with a fresh URL', async () => {
            const user = t.teacher();
            const id = await quickRow(user);
            await t.prisma.userStorage.update({ where: { id }, data: { processingStatus: 'FAILED', queuedAt: new Date() } });

            const res = await ensure(user, id);

            expect(res.document?.processingStatus).toBe(Status.DOCUMENT_PROCESSING_STATUS_PENDING);
            const events = await outboxFor(t.prisma, 'document.uploaded', id);
            expect(events).toHaveLength(1);
            expect(JSON.stringify(events[0].envelope)).toContain('https://r2.test/signed/');
        });

        it('PROCESSING, COMPLETED and recently queued PENDING rows are returned unchanged; a stale queued PENDING is re-announced', async () => {
            const user = t.teacher();
            const [processing, completed, queued, stale] = [await quickRow(user), await quickRow(user), await quickRow(user), await quickRow(user)];
            await t.prisma.userStorage.update({ where: { id: processing }, data: { processingStatus: 'PROCESSING' } });
            await t.prisma.userStorage.update({ where: { id: completed }, data: { processingStatus: 'COMPLETED', pageCount: 4 } });
            await t.prisma.userStorage.update({ where: { id: queued }, data: { queuedAt: new Date() } });
            await t.prisma.userStorage.update({ where: { id: stale }, data: { queuedAt: new Date(Date.now() - 20 * 60 * 1000) } });

            expect((await ensure(user, processing)).document?.processingStatus).toBe(Status.DOCUMENT_PROCESSING_STATUS_PROCESSING);
            expect((await ensure(user, completed)).document).toMatchObject({ processingStatus: Status.DOCUMENT_PROCESSING_STATUS_COMPLETED, pageCount: 4 });
            await ensure(user, queued);
            await ensure(user, stale);
            const events = (await outbox(t.prisma, 'document.uploaded')).filter((e) => [processing, completed, queued, stale].some((id) => JSON.stringify(e.envelope).includes(id)));
            expect(events).toHaveLength(1);
            expect(JSON.stringify(events[0].envelope)).toContain(stale);
        });

        it("another user's id is NOT_FOUND", async () => {
            const id = await quickRow(t.teacher());
            await expect(ensure(t.teacher(), id)).rejects.toMatchObject({ code: 5 });
        });

        it('two racing callers announce the document once', async () => {
            const user = t.teacher();
            const id = await quickRow(user);
            await Promise.all([ensure(user, id), ensure(user, id), ensure(user, id)]);
            expect(await outboxFor(t.prisma, 'document.uploaded', id)).toHaveLength(1);
        });
    });
});
