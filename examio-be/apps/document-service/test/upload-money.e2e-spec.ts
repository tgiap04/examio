import { Metadata } from '@grpc/grpc-js';
import { lastValueFrom } from 'rxjs';
import { DocumentFinance, ChargeFailedError } from '../src/clients/document-finance.service';
import { DocumentErrorCode, documentError } from '../src/modules/upload/document-errors';
import { DocumentChargeService } from '../src/modules/upload/document-charge.service';
import { DocumentReaper } from '../src/modules/upload/document-reaper.service';
import { DocumentRepository } from '../src/modules/upload/document.repository';
import { bootDocumentApp, rid, type DocumentTestApp } from './support/document-test-app';
import { MB, age, call, outbox, outboxFor, queuedKeys, registerBody } from './support/helpers';

/**
 * The 3-step upload charge against a real Postgres, with finance and r2 as real gRPC fakes:
 * PENDING_CHARGE row (committed) -> Debit(doc:<id>) -> conditional PENDING + outbox. Money moves
 * at most once per storage id, and a crash in between is settled by the reaper.
 */
describe('document upload money flow (e2e)', () => {
    let t: DocumentTestApp;
    let reaper: DocumentReaper;

    beforeAll(async () => {
        t = await bootDocumentApp();
        const repo = t.moduleRef.get(DocumentRepository, { strict: false });
        const charge = t.moduleRef.get(DocumentChargeService, { strict: false });
        reaper = new DocumentReaper(repo, charge);
    });
    afterAll(() => t.close());

    const register = async (user: ReturnType<DocumentTestApp['teacher']>, body = registerBody(user)) =>
        call(t.server, 'post', '/ai/upload', await t.tokenFor(user), body);
    const rowOf = (id: string) => t.prisma.userStorage.findUniqueOrThrow({ where: { id } });

    describe('POST /ai/upload (charged)', () => {
        it('debits once as the forwarded user under doc:<id>, then queues OCR with a presigned URL', async () => {
            const user = t.teacher(100);
            const body = registerBody(user, 3 * MB); // ceil(3MB / 2MB) = 2 credits
            const res = await register(user, body);

            expect(res.status).toBe(201);
            expect(res.body).toMatchObject({ status: 'PENDING', newBalance: 98 });
            const id = res.body.id as string;

            const debits = t.finance.calls.filter((c) => c.rpc === 'Debit' && c.userId === user.id);
            expect(debits).toEqual([expect.objectContaining({ key: `doc:${id}`, amount: 2, caller: user.id })]);
            const row = await rowOf(id);
            expect(row).toMatchObject({ processingStatus: 'PENDING', creditCharged: true, chargeFailedAt: null });
            expect(row.queuedAt).not.toBeNull();

            const events = await outboxFor(t.prisma, 'document.uploaded', id);
            expect(events).toHaveLength(1);
            expect(events[0].envelope).toMatchObject({
                type: 'document.uploaded',
                source: 'document',
                version: 1,
                data: {
                    storageId: id,
                    userId: user.id,
                    filename: body.filename,
                    mimetype: 'application/pdf',
                    downloadUrl: `https://r2.test/signed/${body.keyR2}?ttl=3600`,
                },
            });
            // the presign is a service call (svc:document), never the user's token
            expect(t.r2.calls.filter((c) => c.rpc === 'CreatePresignedDownload' && c.keys[0] === body.keyR2)).toEqual([
                expect.objectContaining({ caller: 'svc:document' }),
            ]);
        });

        it('the same upload twice is one upload: same id, one debit', async () => {
            const user = t.teacher(100);
            const body = registerBody(user);
            const first = await register(user, body);
            const second = await register(user, body);

            expect(second.status).toBe(201);
            expect(second.body.id).toBe(first.body.id);
            expect(t.finance.debits.has(`doc:${first.body.id}`)).toBe(true);
            expect([...t.finance.debits.values()].filter((d) => d.userId === user.id)).toHaveLength(1);
            expect(t.finance.balances.get(user.id)).toBe(98);
            expect(await outboxFor(t.prisma, 'document.uploaded', first.body.id)).toHaveLength(1);
        });

        it('one Debit(doc:<id>) even when the gRPC call is retried (the response of the first attempt was lost)', async () => {
            const user = t.teacher(100);
            t.finance.debitFaults.push('apply-then-unavailable'); // applied, then UNAVAILABLE: the client retries
            const res = await register(user);

            expect(res.status).toBe(201);
            const id = res.body.id as string;
            const attempts = t.finance.calls.filter((c) => c.rpc === 'Debit' && c.key === `doc:${id}`);
            expect(attempts).toHaveLength(2);
            expect(attempts.map((c) => c.key)).toEqual([`doc:${id}`, `doc:${id}`]);
            expect([...t.finance.debits.keys()].filter((k) => k === `doc:${id}`)).toHaveLength(1);
            expect(t.finance.balances.get(user.id)).toBe(98);
            expect(await rowOf(id)).toMatchObject({ processingStatus: 'PENDING', creditCharged: true });
        });

        it('insufficient balance: 403, the row is FAILED and hidden, its key is queued for deletion, nothing is announced', async () => {
            const user = t.teacher(0);
            const body = registerBody(user);
            const res = await register(user, body);

            expect(res.status).toBe(403);
            expect(res.body).toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
            const row = await t.prisma.userStorage.findUniqueOrThrow({ where: { keyR2: body.keyR2 } });
            expect(row).toMatchObject({ processingStatus: 'FAILED', creditCharged: false });
            expect(row.chargeFailedAt).not.toBeNull();
            expect(await queuedKeys(t.prisma, [body.keyR2])).toEqual([body.keyR2]);
            expect(await outboxFor(t.prisma, 'document.uploaded', row.id)).toHaveLength(0);
            expect(t.finance.count('Refund', `doc:${row.id}`)).toBe(0); // a definitive refusal needs no compensation

            // the user never got a file: it is neither listed, nor readable, nor counted
            const token = await t.tokenFor(user);
            const list = await lastValueFrom(t.grpc.listDocuments({ page: 1, size: 10 }, await t.md(user)));
            expect(list.documents).toEqual([]);
            expect((await call(t.server, 'get', `/ai/upload/${row.id}`, token)).status).toBe(404);
            expect((await lastValueFrom(t.grpc.getQuota({}, await t.md(user)))).usedThisMonth).toBe(0);
        });

        it('a key that belongs to someone else is refused before anything is stored or charged', async () => {
            const user = t.teacher(100);
            const other = t.teacher(100);
            const res = await register(user, { ...registerBody(user), keyR2: `ai-uploads/${other.id}/stolen.pdf` });
            expect(res.status).toBe(400);
            expect(t.finance.calls.filter((c) => c.userId === user.id && c.rpc === 'Debit')).toHaveLength(0);
        });

        // F12 (moved from exam with the route): `%2e%2e` (any case) passes a literal `..` check, then resolves
        // to another owner's object once a browser or fetcher normalises it. Only canonical keys may pass.
        it.each(['%2e%2e', '%2E%2E'])('a key traversing %s into another owner prefix is 400: no row, no debit', async (enc) => {
            const user = t.teacher(100);
            const other = t.teacher(100);
            const filename = `trav-${rid()}.pdf`;
            const keyR2 = `ai-teacher/${user.id}/${enc}/${other.id}/x-${rid()}.pdf`;
            const res = await register(user, { filename, url: `https://r2.test/${keyR2}`, mimetype: 'application/pdf', size: 1024, keyR2 });
            expect(res.status).toBe(400);
            expect(JSON.stringify(res.body)).toContain('keyR2');
            expect(await t.prisma.userStorage.count({ where: { userId: user.id, filename } })).toBe(0);
            expect(t.finance.calls.filter((c) => c.userId === user.id && c.rpc === 'Debit')).toHaveLength(0);
        });

        it.each([
            ['an empty segment', (id: string) => `ai-teacher/${id}//x.pdf`],
            ['a newline inside a traversal segment', (id: string) => `ai-teacher/${id}/.\n./x.pdf`],
            ['a tab inside a traversal segment', (id: string) => `ai-teacher/${id}/.\t./x.pdf`],
        ])('a key with %s under the own prefix is 400, nothing charged', async (_label, keyOf) => {
            const user = t.teacher(100);
            const keyR2 = keyOf(user.id);
            const res = await register(user, { filename: `e-${rid()}.pdf`, url: `https://r2.test/${keyR2}`, mimetype: 'application/pdf', size: 1024, keyR2 });
            expect(res.status).toBe(400);
            expect(t.finance.calls.filter((c) => c.userId === user.id && c.rpc === 'Debit')).toHaveLength(0);
        });

        it('a crash after the debit leaves PENDING_CHARGE; the reaper refunds once, fails the row and queues the key', async () => {
            const user = t.teacher(100);
            const body = registerBody(user);
            const repo = t.moduleRef.get(DocumentRepository, { strict: false });
            const confirm = jest.spyOn(repo, 'confirmCharge').mockRejectedValueOnce(new Error('crash after step 2'));
            const res = await register(user, body);
            confirm.mockRestore();

            expect(res.status).toBe(500);
            const row = await t.prisma.userStorage.findUniqueOrThrow({ where: { keyR2: body.keyR2 } });
            expect(row.processingStatus).toBe('PENDING_CHARGE');
            expect(t.finance.balances.get(user.id)).toBe(98); // charged
            expect(await outboxFor(t.prisma, 'document.uploaded', row.id)).toHaveLength(0);

            // young rows are left alone (the table is shared, so assert this row, not the pass total)
            await reaper.tick();
            expect((await rowOf(row.id)).processingStatus).toBe('PENDING_CHARGE');
            expect(t.finance.count('Refund', `doc:${row.id}`)).toBe(0);
            await age(t.prisma, row.id, 11);
            expect(await reaper.tick()).toBeGreaterThanOrEqual(1);
            await reaper.tick(); // a settled row is never settled twice

            const settled = await rowOf(row.id);
            expect(settled.processingStatus).toBe('FAILED');
            expect(settled.chargeFailedAt).not.toBeNull();
            expect(t.finance.balances.get(user.id)).toBe(100);
            expect(t.finance.calls.filter((c) => c.rpc === 'Refund' && c.key === `doc:${row.id}`)).toEqual([
                expect.objectContaining({ caller: 'svc:document', userId: user.id }),
            ]);
            expect(await queuedKeys(t.prisma, [body.keyR2])).toEqual([body.keyR2]);
            // the same upload can not be resurrected under the refunded key
            expect((await register(user, body)).status).toBe(409);
        });

        it('a row that was never charged is also settled: Refund is NOT_FOUND, the row still fails and its key is queued', async () => {
            const user = t.teacher(100);
            const body = registerBody(user);
            const row = await t.prisma.userStorage.create({
                data: { id: `crash_${rid()}`, userId: user.id, filename: body.filename, url: body.url, mimetype: body.mimetype, size: body.size, keyR2: body.keyR2, processingStatus: 'PENDING_CHARGE' },
            });
            await age(t.prisma, row.id, 30);
            expect(await reaper.tick()).toBeGreaterThanOrEqual(1);

            expect(await rowOf(row.id)).toMatchObject({ processingStatus: 'FAILED' });
            expect(t.finance.balances.get(user.id)).toBe(100);
            expect(t.finance.count('Refund', `doc:${row.id}`)).toBe(1);
            expect(await queuedKeys(t.prisma, [body.keyR2])).toEqual([body.keyR2]);
        });

        const GRACE_PLUS = 3 * 60 * 1000; // past REFUND_SWEEP_GRACE_MS (2 min)
        const later = (ms: number) => new Date(Date.now() + ms);
        const refundCalls = (id: string) => t.finance.calls.filter((c) => c.rpc === 'Refund' && c.key === `doc:${id}`);

        it('an ambiguous debit failure (finance down) claims the row first, tries a refund, answers 403 CHARGE_UNAVAILABLE and keeps the refund open', async () => {
            const user = t.teacher(100);
            const body = registerBody(user);
            t.finance.debitFaults.push('internal'); // not retried: the outcome is unknown to us
            const res = await register(user, body);

            expect(res.status).toBe(403);
            expect(res.body).toMatchObject({ code: 'CHARGE_UNAVAILABLE' });
            const row = await t.prisma.userStorage.findUniqueOrThrow({ where: { keyR2: body.keyR2 } });
            expect(row.processingStatus).toBe('FAILED');
            expect(row.chargeFailedAt).not.toBeNull();
            expect(row.refundSettledAt).toBeNull(); // Refund NOT_FOUND is not proof the debit never happened
            expect(refundCalls(row.id)).toHaveLength(1);
            expect(await queuedKeys(t.prisma, [body.keyR2])).toEqual([body.keyR2]);
        });

        it('a debit that times out but commits AFTER the refund attempt is still refunded exactly once, by the sweeper after the grace period', async () => {
            const user = t.teacher(100);
            const body = registerBody(user);
            t.finance.debitFaults.push('internal');
            const res = await register(user, body);
            expect(res.status).toBe(403);
            const row = await t.prisma.userStorage.findUniqueOrThrow({ where: { keyR2: body.keyR2 } });
            expect(refundCalls(row.id)).toHaveLength(1); // the compensating attempt: NOT_FOUND, nothing yet to refund

            // ...and now the lost Debit commits in finance
            t.finance.debits.set(`doc:${row.id}`, { userId: user.id, amount: 2 });
            t.finance.balances.set(user.id, 98);

            await reaper.tick(later(60_000)); // inside the grace period: untouched
            expect(refundCalls(row.id)).toHaveLength(1);
            expect((await rowOf(row.id)).refundSettledAt).toBeNull();

            await reaper.tick(later(GRACE_PLUS));
            expect(t.finance.refunds.has(`doc:${row.id}`)).toBe(true);
            expect(t.finance.balances.get(user.id)).toBe(100);
            expect((await rowOf(row.id)).refundSettledAt).not.toBeNull();

            const calls = refundCalls(row.id).length;
            await reaper.tick(later(2 * GRACE_PLUS)); // settled: finance is not asked again
            expect(refundCalls(row.id)).toHaveLength(calls);
            expect(t.finance.balances.get(user.id)).toBe(100);
        });

        it('a Refund NOT_FOUND settles only past the grace period (the debit really never happened)', async () => {
            const user = t.teacher(100);
            const body = registerBody(user);
            t.finance.debitFaults.push('internal');
            await register(user, body);
            const row = await t.prisma.userStorage.findUniqueOrThrow({ where: { keyR2: body.keyR2 } });

            await reaper.tick(later(GRACE_PLUS));

            expect((await rowOf(row.id)).refundSettledAt).not.toBeNull();
            expect(refundCalls(row.id)).toHaveLength(2);
            expect(t.finance.balances.get(user.id)).toBe(100);
            await reaper.tick(later(2 * GRACE_PLUS));
            expect(refundCalls(row.id)).toHaveLength(2);
        });

        it('if the compensation itself fails the row stays FAILED with the refund open, and the sweeper retries it', async () => {
            const user = t.teacher(100);
            const body = registerBody(user);
            t.finance.debitFaults.push('apply-then-unavailable', 'unavailable', 'unavailable'); // all attempts fail
            t.finance.refundFaults.push('internal');
            const res = await register(user, body);

            expect(res.status).toBe(403);
            const row = await t.prisma.userStorage.findUniqueOrThrow({ where: { keyR2: body.keyR2 } });
            expect(row).toMatchObject({ processingStatus: 'FAILED' });
            expect(row.refundSettledAt).toBeNull();
            expect(t.finance.balances.get(user.id)).toBe(98); // the first attempt did apply
            await reaper.tick(later(GRACE_PLUS));
            expect(await rowOf(row.id)).toMatchObject({ processingStatus: 'FAILED' });
            expect((await rowOf(row.id)).refundSettledAt).not.toBeNull();
            expect(t.finance.balances.get(user.id)).toBe(100);
        });

        it.each([
            ['PERMISSION_DENIED', 403, 'PERMISSION_DENIED'],
            ['INVALID_ARGUMENT', 400, 'VALIDATION_FAILED'],
        ])('L7: a definitive %s from finance settles at once: no refund attempt, nothing parked', async (kind, http, code) => {
            const user = t.teacher(100);
            const body = registerBody(user);
            t.finance.debitFaults.push(kind === 'PERMISSION_DENIED' ? 'permission-denied' : 'invalid-argument');
            const res = await register(user, body);

            expect(res.status).toBe(http);
            expect(res.body).toMatchObject({ code });
            const row = await t.prisma.userStorage.findUniqueOrThrow({ where: { keyR2: body.keyR2 } });
            expect(row).toMatchObject({ processingStatus: 'FAILED' });
            expect(row.refundSettledAt).not.toBeNull();
            expect(refundCalls(row.id)).toHaveLength(0);
        });

        it('L1: a request whose debit answer was lost cannot refund a row that a concurrent request already confirmed', async () => {
            const user = t.teacher(100);
            const body = registerBody(user);
            const finance = t.moduleRef.get(DocumentFinance, { strict: false });
            const real = finance.debit.bind(finance);
            const spy = jest.spyOn(finance, 'debit').mockImplementationOnce(async (...args) => {
                await real(...args); // the debit commits...
                await register(user, body); // ...and a concurrent identical request confirms the row
                throw new ChargeFailedError(false, documentError(403, DocumentErrorCode.CHARGE_UNAVAILABLE, 'lost'));
            });
            const res = await register(user, body);
            spy.mockRestore();

            expect(res.status).toBe(201); // the winner's confirmation is a success
            const row = await t.prisma.userStorage.findUniqueOrThrow({ where: { keyR2: body.keyR2 } });
            expect(row).toMatchObject({ processingStatus: 'PENDING', creditCharged: true, chargeFailedAt: null });
            expect(refundCalls(row.id)).toHaveLength(0);
            expect(t.finance.balances.get(user.id)).toBe(98);
            expect(await outboxFor(t.prisma, 'document.uploaded', row.id)).toHaveLength(1);
            await reaper.tick(later(GRACE_PLUS));
            expect(refundCalls(row.id)).toHaveLength(0);
        });
    });

    describe('POST /ai/quick-upload (never charged)', () => {
        const quick = async (user: ReturnType<DocumentTestApp['teacher']>, name = `slides-${rid()}.pdf`, size = 10 * 1024) =>
            call(t.server, 'post', '/ai/quick-upload', await t.tokenFor(user))
                .attach('file', Buffer.alloc(size, 7), { filename: name, contentType: 'application/pdf' });

        it('stores the file as svc:document, creates a PENDING uncharged row and makes no Debit and no event', async () => {
            const user = t.teacher(100);
            const res = await quick(user, 'notes.pdf');

            expect(res.status).toBe(201);
            expect(res.body).toMatchObject({ success: true, filename: 'notes.pdf' });
            const id = res.body.userStorageId as string;
            const row = await rowOf(id);
            expect(row).toMatchObject({ processingStatus: 'PENDING', creditCharged: false, userId: user.id, queuedAt: null });
            expect(row.keyR2.startsWith(`ai-teacher/${user.id}/`)).toBe(true);
            expect(res.body.url).toBe(`https://r2.test/${row.keyR2}`);
            expect(t.r2.calls.filter((c) => c.rpc === 'UploadFile' && c.keys[0] === row.keyR2)).toEqual([
                expect.objectContaining({ caller: 'svc:document' }),
            ]);
            expect(t.finance.calls.filter((c) => c.rpc === 'Debit' && c.userId === user.id)).toHaveLength(0);
            expect(t.finance.balances.get(user.id)).toBe(100);
            expect(await outboxFor(t.prisma, 'document.uploaded', id)).toHaveLength(0);
        });

        it('over 5 MB is 400 and stores nothing', async () => {
            const user = t.teacher(100);
            const before = t.r2.calls.length;
            const res = await quick(user, 'big.pdf', 5 * MB + 1);
            expect(res.status).toBe(400);
            expect(t.r2.calls).toHaveLength(before);
        });

        it('quota exceeded: 403 QUOTA_EXCEEDED before anything is stored or charged', async () => {
            const user = t.teacher(100);
            t.finance.filesPerMonth.set(user.id, 1);
            expect((await quick(user)).status).toBe(201);

            const uploads = t.r2.calls.filter((c) => c.rpc === 'UploadFile').length;
            const res = await quick(user);
            expect(res.status).toBe(403);
            expect(res.body).toMatchObject({ code: 'QUOTA_EXCEEDED' });
            expect(t.r2.calls.filter((c) => c.rpc === 'UploadFile')).toHaveLength(uploads);

            const charged = await register(user);
            expect(charged.status).toBe(403);
            expect(charged.body).toMatchObject({ code: 'QUOTA_EXCEEDED' });
            expect(t.finance.calls.filter((c) => c.rpc === 'Debit' && c.userId === user.id)).toHaveLength(0);

            t.finance.filesPerMonth.set(user.id, -1); // unlimited
            expect((await quick(user)).status).toBe(201);
        });
    });

    describe('owner-only reads and deletes', () => {
        it("another user's GET and DELETE are 404 and change nothing; the owner's work", async () => {
            const owner = t.teacher(100);
            const intruder = t.teacher(100);
            const created = await register(owner);
            const id = created.body.id as string;
            const ownerToken = await t.tokenFor(owner);
            const intruderToken = await t.tokenFor(intruder);

            expect((await call(t.server, 'get', `/ai/upload/${id}`, intruderToken)).status).toBe(404);
            expect((await call(t.server, 'delete', `/ai/upload/${id}`, intruderToken)).status).toBe(404);
            expect(await t.prisma.userStorage.count({ where: { id } })).toBe(1);
            expect(await outboxFor(t.prisma, 'document.deleted', id)).toHaveLength(0);

            const detail = await call(t.server, 'get', `/ai/upload/${id}`, ownerToken);
            expect(detail.status).toBe(200);
            expect(detail.body).toMatchObject({ id, userId: owner.id, processingStatus: 'PENDING', creditCharged: true });
            expect(Object.keys(detail.body)).not.toContain('chargeFailedAt');

            const list = await lastValueFrom(t.grpc.listDocuments({ page: 1, size: 10 }, await t.md(owner)));
            expect(list.documents).toEqual([expect.objectContaining({ id })]);
            expect((await lastValueFrom(t.grpc.listDocuments({ page: 1, size: 10 }, await t.md(intruder)))).documents).toEqual([]);

            expect((await call(t.server, 'delete', `/ai/upload/${id}`, ownerToken)).body).toEqual({ success: true, message: 'Xóa thành công' });
            expect((await call(t.server, 'get', `/ai/upload/${id}`, ownerToken)).status).toBe(404);
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
            const user = t.teacher(100);
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

    it('the gRPC error mapping of a spent quota and a refused debit matches the contract', async () => {
        const user = t.teacher(0);
        const md: Metadata = await t.md(user);
        const request = { filename: `a-${rid()}.pdf`, mimetype: 'application/pdf', data: Buffer.alloc(1024), chargeCredits: true, reuseDuplicate: false };
        await expect(lastValueFrom(t.grpc.createUpload(request, md))).rejects.toMatchObject({ code: 9 }); // FAILED_PRECONDITION
        t.finance.filesPerMonth.set(user.id, 0);
        await expect(lastValueFrom(t.grpc.createUpload(request, md))).rejects.toMatchObject({ code: 8 }); // RESOURCE_EXHAUSTED
        expect((await outbox(t.prisma, 'document.uploaded')).filter((e) => JSON.stringify(e.envelope).includes(user.id))).toHaveLength(0);
    });
});
