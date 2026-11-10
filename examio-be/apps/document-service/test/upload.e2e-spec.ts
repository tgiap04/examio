import { lastValueFrom } from 'rxjs';
import { R2Client } from '../src/clients/r2.client';
import { bootDocumentApp, rid, type DocumentTestApp } from './support/document-test-app';
import { MB, call, outboxFor, registerBody } from './support/helpers';

/**
 * Accepting uploads against a real Postgres, with r2 as a real gRPC fake. Nothing is charged and there
 * is no monthly quota: `POST /ai/upload` inserts the row PENDING with its `document.uploaded` outbox row
 * in one transaction; quick-upload stores a PENDING row that is not queued until the first chat message.
 */
describe('document uploads (e2e)', () => {
    let t: DocumentTestApp;

    beforeAll(async () => {
        t = await bootDocumentApp();
    });
    afterAll(() => t.close());

    type User = ReturnType<DocumentTestApp['teacher']>;
    const register = async (user: User, body = registerBody(user)) => call(t.server, 'post', '/ai/upload', await t.tokenFor(user), body);
    const rowOf = (id: string) => t.prisma.userStorage.findUniqueOrThrow({ where: { id } });

    describe('POST /ai/upload', () => {
        it('inserts the row PENDING and queues OCR with a presigned URL, in one transaction, with no balance in the answer', async () => {
            const user = t.teacher();
            const body = registerBody(user, 3 * MB);
            const res = await register(user, body);

            expect(res.status).toBe(201);
            expect(res.body).toEqual({ id: expect.any(String), status: 'PENDING', message: expect.any(String) });
            const id = res.body.id as string;
            const row = await rowOf(id);
            expect(row).toMatchObject({ processingStatus: 'PENDING', userId: user.id, keyR2: body.keyR2 });
            expect(row.queuedAt).not.toBeNull();
            expect(Object.keys(row)).not.toEqual(expect.arrayContaining(['creditCharged']));

            const events = await outboxFor(t.prisma, 'document.uploaded', id);
            expect(events).toHaveLength(1);
            expect(events[0].envelope).toMatchObject({
                type: 'document.uploaded',
                source: 'document',
                version: 1,
                data: { storageId: id, userId: user.id, filename: body.filename, mimetype: 'application/pdf', downloadUrl: `https://r2.test/signed/${body.keyR2}?ttl=3600` },
            });
            // the presign is a service call (svc:document), never the user's token
            expect(t.r2.calls.filter((c) => c.rpc === 'CreatePresignedDownload' && c.keys[0] === body.keyR2)).toEqual([
                expect.objectContaining({ caller: 'svc:document' }),
            ]);
        });

        it('the same upload twice is one upload: same id, one event', async () => {
            const user = t.teacher();
            const body = registerBody(user);
            const first = await register(user, body);
            const second = await register(user, body);

            expect(second.status).toBe(201);
            expect(second.body.id).toBe(first.body.id);
            expect(await outboxFor(t.prisma, 'document.uploaded', first.body.id)).toHaveLength(1);
        });

        it('a 6th (and 7th) upload in the same month is accepted: there is no monthly quota', async () => {
            const user = t.teacher();
            for (let i = 0; i < 7; i += 1) expect((await register(user)).status).toBe(201);
            const quota = await lastValueFrom(t.grpc.getQuota({}, await t.md(user)));
            expect(quota).toEqual({ usedThisMonth: 7, fileCount: 7 });
        });

        it('r2 unable to sign the download URL: 503, no row, no event; the same key registers fine afterwards', async () => {
            const user = t.teacher();
            const body = registerBody(user);
            const r2 = t.moduleRef.get(R2Client, { strict: false });
            const presign = jest.spyOn(r2, 'createPresignedDownload').mockRejectedValueOnce(new Error('r2 down'));

            const failed = await register(user, body);
            presign.mockRestore();
            expect(failed.status).toBe(503);
            expect(failed.body).toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
            expect(await t.prisma.userStorage.count({ where: { keyR2: body.keyR2 } })).toBe(0);

            const retried = await register(user, body);
            expect(retried.status).toBe(201);
            expect(await outboxFor(t.prisma, 'document.uploaded', retried.body.id)).toHaveLength(1);
        });

        it('a key that belongs to someone else is refused before anything is stored', async () => {
            const user = t.teacher();
            const other = t.teacher();
            const res = await register(user, { ...registerBody(user), keyR2: `ai-uploads/${other.id}/stolen.pdf` });
            expect(res.status).toBe(400);
            expect(await t.prisma.userStorage.count({ where: { userId: user.id } })).toBe(0);
        });

        // F12: `%2e%2e` (any case) passes a literal `..` check, then resolves to another owner's object once a
        // browser or fetcher normalises it. Only canonical keys may pass.
        it.each(['%2e%2e', '%2E%2E'])('a key traversing %s into another owner prefix is 400: no row', async (enc) => {
            const user = t.teacher();
            const other = t.teacher();
            const filename = `trav-${rid()}.pdf`;
            const keyR2 = `ai-teacher/${user.id}/${enc}/${other.id}/x-${rid()}.pdf`;
            const res = await register(user, { filename, url: `https://r2.test/${keyR2}`, mimetype: 'application/pdf', size: 1024, keyR2 });
            expect(res.status).toBe(400);
            expect(JSON.stringify(res.body)).toContain('keyR2');
            expect(await t.prisma.userStorage.count({ where: { userId: user.id, filename } })).toBe(0);
        });

        it.each([
            ['an empty segment', (id: string) => `ai-teacher/${id}//x.pdf`],
            ['a newline inside a traversal segment', (id: string) => `ai-teacher/${id}/.\n./x.pdf`],
            ['a tab inside a traversal segment', (id: string) => `ai-teacher/${id}/.\t./x.pdf`],
        ])('a key with %s under the own prefix is 400', async (_label, keyOf) => {
            const user = t.teacher();
            const keyR2 = keyOf(user.id);
            const res = await register(user, { filename: `e-${rid()}.pdf`, url: `https://r2.test/${keyR2}`, mimetype: 'application/pdf', size: 1024, keyR2 });
            expect(res.status).toBe(400);
        });
    });

    describe('POST /ai/quick-upload', () => {
        const quick = async (user: User, name = `slides-${rid()}.pdf`, size = 10 * 1024) =>
            call(t.server, 'post', '/ai/quick-upload', await t.tokenFor(user)).attach('file', Buffer.alloc(size, 7), { filename: name, contentType: 'application/pdf' });

        it('stores the file as svc:document and creates a PENDING row that is not queued (no event)', async () => {
            const user = t.teacher();
            const res = await quick(user, 'notes.pdf');

            expect(res.status).toBe(201);
            expect(res.body).toMatchObject({ success: true, filename: 'notes.pdf' });
            const id = res.body.userStorageId as string;
            const row = await rowOf(id);
            expect(row).toMatchObject({ processingStatus: 'PENDING', userId: user.id, queuedAt: null });
            expect(row.keyR2.startsWith(`ai-teacher/${user.id}/`)).toBe(true);
            expect(res.body.url).toBe(`https://r2.test/${row.keyR2}`);
            expect(t.r2.calls.filter((c) => c.rpc === 'UploadFile' && c.keys[0] === row.keyR2)).toEqual([expect.objectContaining({ caller: 'svc:document' })]);
            expect(await outboxFor(t.prisma, 'document.uploaded', id)).toHaveLength(0);
        });

        it('over 5 MB is 400 and stores nothing; many small ones in a month are all accepted', async () => {
            const user = t.teacher();
            const before = t.r2.calls.length;
            expect((await quick(user, 'big.pdf', 5 * MB + 1)).status).toBe(400);
            expect(t.r2.calls).toHaveLength(before);
            for (let i = 0; i < 6; i += 1) expect((await quick(user)).status).toBe(201);
        });
    });

    describe('owner-only reads and deletes', () => {
        it("another user's GET and DELETE are 404 and change nothing; the owner's work", async () => {
            const owner = t.teacher();
            const intruder = t.teacher();
            const id = (await register(owner)).body.id as string;
            const ownerToken = await t.tokenFor(owner);
            const intruderToken = await t.tokenFor(intruder);

            expect((await call(t.server, 'get', `/ai/upload/${id}`, intruderToken)).status).toBe(404);
            expect((await call(t.server, 'delete', `/ai/upload/${id}`, intruderToken)).status).toBe(404);
            expect(await t.prisma.userStorage.count({ where: { id } })).toBe(1);
            expect(await outboxFor(t.prisma, 'document.deleted', id)).toHaveLength(0);

            const detail = await call(t.server, 'get', `/ai/upload/${id}`, ownerToken);
            expect(detail.status).toBe(200);
            expect(detail.body).toMatchObject({ id, userId: owner.id, processingStatus: 'PENDING' });
            expect(Object.keys(detail.body)).not.toContain('creditCharged');

            const list = await lastValueFrom(t.grpc.listDocuments({ page: 1, size: 10 }, await t.md(owner)));
            expect(list.documents).toEqual([expect.objectContaining({ id })]);
            expect((await lastValueFrom(t.grpc.listDocuments({ page: 1, size: 10 }, await t.md(intruder)))).documents).toEqual([]);

            expect((await call(t.server, 'delete', `/ai/upload/${id}`, ownerToken)).body).toEqual({ success: true, message: 'Xóa thành công' });
            expect((await call(t.server, 'get', `/ai/upload/${id}`, ownerToken)).status).toBe(404);
        });

        it('a FAILED row is listed and readable by its owner exactly like any other row', async () => {
            const owner = t.teacher();
            const id = (await register(owner)).body.id as string;
            await t.prisma.userStorage.update({ where: { id }, data: { processingStatus: 'FAILED' } });

            const detail = await call(t.server, 'get', `/ai/upload/${id}`, await t.tokenFor(owner));
            expect(detail.body).toMatchObject({ id, processingStatus: 'FAILED' });
            const list = await lastValueFrom(t.grpc.listDocuments({ page: 1, size: 10 }, await t.md(owner)));
            expect(list.documents.map((d) => d.id)).toEqual([id]);
        });

        it('a STUDENT (no document:upload) and an anonymous caller are refused on every route', async () => {
            const student = t.user(['STUDENT']);
            const token = await t.tokenFor(student);
            for (const [method, path] of [
                ['get', '/ai/upload/x'],
                ['delete', '/ai/upload/x'],
                ['post', '/ai/upload'],
                ['post', '/ai/quick-upload'],
                ['post', '/ai/upload-image'],
                ['post', '/r2/image'],
            ] as const) {
                expect([method, path, (await call(t.server, method, path, token)).status]).toEqual([method, path, 403]);
                expect([method, path, (await call(t.server, method, path)).status]).toEqual([method, path, 401]);
            }
        });
    });

    describe('POST /r2/image and the upload-image placeholder', () => {
        it('stores an image under images/<userId> and returns its public url; non-images and >2 MB are 400', async () => {
            const user = t.teacher();
            const token = await t.tokenFor(user);
            const ok = await call(t.server, 'post', '/r2/image', token).attach('file', Buffer.alloc(2048, 1), { filename: 'Ảnh đẹp.png', contentType: 'image/png' });
            expect(ok.status).toBe(201);
            expect(ok.body.url).toMatch(new RegExp(`^https://r2\\.test/images/${user.id}/\\d+-`));
            expect(t.r2.calls.at(-1)).toMatchObject({ rpc: 'UploadFile', caller: 'svc:document' });

            const text = await call(t.server, 'post', '/r2/image', token).attach('file', Buffer.alloc(10), { filename: 'a.txt', contentType: 'text/plain' });
            expect(text.status).toBe(400);
            const big = await call(t.server, 'post', '/r2/image', token).attach('file', Buffer.alloc(2 * MB + 1), { filename: 'b.png', contentType: 'image/png' });
            expect(big.status).toBe(400);

            const placeholder = await call(t.server, 'post', '/ai/upload-image', token, { image: 'data' });
            expect(placeholder.body).toEqual({ success: true, message: 'Image upload endpoint - implementation pending' });
        });
    });
});
