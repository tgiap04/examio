import { call, bootExamApp, rid, teacher, type ExamTestApp } from './support';
import { DocumentStatus } from '../ownership/support/fake-document';

/**
 * ai-chat after UserStorage left exam: every document read is a document-service call made as the
 * caller (never as a service), `clearChat` deletes the files in ONE call, and a document-service outage
 * keeps the chat.
 */
describe('ai-chat document carve-out (e2e)', () => {
    let t: ExamTestApp;

    beforeAll(async () => {
        t = await bootExamApp();
    });
    afterAll(() => t?.close());

    async function chatWith(userId: string, documents: Array<{ id: string; name: string }>) {
        const chat = await t.prisma.aIChat.create({ data: { id: `chat_${rid()}`, userId, title: 't' } });
        if (documents.length > 0) {
            await t.prisma.aIChatDocument.createMany({
                data: documents.map((d) => ({ chatId: chat.id, documentId: d.id, documentName: d.name })),
            });
        }
        return chat;
    }
    const callsOf = (rpc: string, since: number) => t.document.calls.slice(since).filter((c) => c.rpc === rpc);

    it('attaching a document asserts ownership as the caller; a foreign document is 403 and is not linked', async () => {
        const user = await teacher(t);
        const other = await teacher(t);
        const mine = t.document.add(user.id, { filename: 'mine.pdf' });
        const theirs = t.document.add(other.id, { filename: 'theirs.pdf' });
        const chat = await chatWith(user.id, []);
        const since = t.document.calls.length;

        const ok = await call(t.server, 'post', `/ai-chat/${chat.id}/documents`, user.token, { documentId: mine.id, documentName: 'mine.pdf' });
        const bad = await call(t.server, 'post', `/ai-chat/${chat.id}/documents`, user.token, { documentId: theirs.id, documentName: 'theirs.pdf' });

        expect(ok.status).toBeLessThan(300);
        expect(bad.status).toBe(403);
        expect(callsOf('AssertOwnership', since).map((c) => [c.caller, c.ids])).toEqual([
            [user.id, [mine.id]],
            [user.id, [theirs.id]],
        ]);
        expect((await t.prisma.aIChatDocument.findMany({ where: { chatId: chat.id } })).map((d) => d.documentId)).toEqual([mine.id]);
    });

    it('listing the chat documents is a local read: no document-service call', async () => {
        const user = await teacher(t);
        const doc = t.document.add(user.id);
        const chat = await chatWith(user.id, [{ id: doc.id, name: 'x.pdf' }]);
        const since = t.document.calls.length;

        const res = await call(t.server, 'get', `/ai-chat/${chat.id}/documents`, user.token);

        expect(res.status).toBe(200);
        expect(res.body).toEqual([{ documentId: doc.id, documentName: 'x.pdf' }]);
        expect(t.document.calls.slice(since)).toEqual([]);
    });

    it('sending a message reads the chat documents, re-queues only the PENDING / FAILED ones, then waits for their OCR before answering', async () => {
        const user = await teacher(t);
        const done = t.document.add(user.id, { processingStatus: DocumentStatus.DOCUMENT_PROCESSING_STATUS_COMPLETED });
        const failed = t.document.add(user.id, { processingStatus: DocumentStatus.DOCUMENT_PROCESSING_STATUS_FAILED });
        const pending = t.document.add(user.id, { processingStatus: DocumentStatus.DOCUMENT_PROCESSING_STATUS_PENDING });
        const chat = await chatWith(user.id, [done, failed, pending].map((d) => ({ id: d.id, name: d.filename })));
        const since = t.document.calls.length;
        // ai-service finishes the OCR of the two re-queued documents a moment after the message arrives
        const ocr = setTimeout(() => {
            for (const doc of [failed, pending]) doc.processingStatus = DocumentStatus.DOCUMENT_PROCESSING_STATUS_COMPLETED;
        }, 1_500);

        let res;
        try {
            res = await call(t.server, 'post', `/ai-chat/${chat.id}/message`, user.token, { message: 'hi' });
        } finally {
            clearTimeout(ocr);
        }

        expect(res.status).toBeLessThan(300);
        // M3: ONE read of every chat document, then polls of the not-yet-COMPLETED ones only (the done one is never polled again)
        const reads = callsOf('GetDocumentsByIds', since);
        expect(reads.length).toBeGreaterThanOrEqual(2);
        expect([...(reads[0].ids ?? [])].sort()).toEqual([done.id, failed.id, pending.id].sort());
        for (const poll of reads.slice(1)) expect([...(poll.ids ?? [])].sort()).toEqual([failed.id, pending.id].sort());
        expect(reads.every((c) => c.caller === user.id)).toBe(true);
        expect(callsOf('EnsureProcessed', since).map((c) => c.ids?.[0]).sort()).toEqual([failed.id, pending.id].sort());
        expect(callsOf('AssertOwnership', since)).toHaveLength(0);
        expect(t.document.calls.slice(since).every((c) => !c.caller.startsWith('svc:'))).toBe(true);
    });

    it('a document id the caller does not own is refused (403) before anything is saved', async () => {
        const user = await teacher(t);
        const other = await teacher(t);
        const theirs = t.document.add(other.id);
        const chat = await chatWith(user.id, []);

        const res = await call(t.server, 'post', `/ai-chat/${chat.id}/message`, user.token, { message: 'hi', documentId: theirs.id });

        expect(res.status).toBe(403);
        expect(await t.prisma.aIChatMessage.count({ where: { chatId: chat.id } })).toBe(0);
    });

    it('clearChat with files deletes them with ONE DeleteDocuments call as the caller, names come from the response, then the chat', async () => {
        const user = await teacher(t);
        const a = t.document.add(user.id, { filename: 'a.pdf' });
        const b = t.document.add(user.id, { filename: 'b.pdf' });
        const chat = await chatWith(user.id, [a, b].map((d) => ({ id: d.id, name: d.filename })));
        const since = t.document.calls.length;

        const res = await call(t.server, 'post', `/ai-chat/${chat.id}/clear`, user.token, { deleteFiles: true });

        expect(res.status).toBeLessThan(300);
        expect(res.body).toMatchObject({ success: true, message: 'Chat và files đã được xóa' });
        expect([...res.body.deletedFiles].sort()).toEqual(['a.pdf', 'b.pdf']);
        const deletes = callsOf('DeleteDocuments', since);
        expect(deletes).toHaveLength(1);
        expect(deletes[0]).toMatchObject({ caller: user.id });
        expect([...(deletes[0].ids ?? [])].sort()).toEqual([a.id, b.id].sort());
        expect(await t.prisma.aIChat.findUnique({ where: { id: chat.id } })).toBeNull();
        expect(t.document.docs.has(a.id) || t.document.docs.has(b.id)).toBe(false);
    });

    it('clearChat without files never calls document-service', async () => {
        const user = await teacher(t);
        const doc = t.document.add(user.id);
        const chat = await chatWith(user.id, [{ id: doc.id, name: 'k.pdf' }]);
        const since = t.document.calls.length;

        const res = await call(t.server, 'post', `/ai-chat/${chat.id}/clear`, user.token, { deleteFiles: false });

        expect(res.status).toBeLessThan(300);
        expect(t.document.calls.slice(since)).toEqual([]);
        expect(t.document.docs.has(doc.id)).toBe(true);
    });

    it('clearChat while document-service is unavailable is a 503 and the chat (and its links) are kept; a retry deletes both', async () => {
        const user = await teacher(t);
        const doc = t.document.add(user.id, { filename: 'keep.pdf' });
        const chat = await chatWith(user.id, [{ id: doc.id, name: 'keep.pdf' }]);
        t.document.fault('DeleteDocuments', 14, 'STORAGE_UNAVAILABLE');

        const down = await call(t.server, 'post', `/ai-chat/${chat.id}/clear`, user.token, { deleteFiles: true });

        expect(down.status).toBe(503);
        expect(await t.prisma.aIChat.findUnique({ where: { id: chat.id } })).not.toBeNull();
        expect(await t.prisma.aIChatDocument.count({ where: { chatId: chat.id } })).toBe(1);
        expect(t.document.docs.has(doc.id)).toBe(true);

        const retry = await call(t.server, 'post', `/ai-chat/${chat.id}/clear`, user.token, { deleteFiles: true });
        expect(retry.status).toBeLessThan(300);
        expect(retry.body.deletedFiles).toEqual(['keep.pdf']);
        expect(await t.prisma.aIChat.findUnique({ where: { id: chat.id } })).toBeNull();
    });

    it('a deadline-exceeded answer is also a 503 with the chat kept', async () => {
        const user = await teacher(t);
        const doc = t.document.add(user.id);
        const chat = await chatWith(user.id, [{ id: doc.id, name: 'x.pdf' }]);
        t.document.fault('DeleteDocuments', 4, 'slow');

        const res = await call(t.server, 'post', `/ai-chat/${chat.id}/clear`, user.token, { deleteFiles: true });

        expect(res.status).toBe(503);
        expect(await t.prisma.aIChat.findUnique({ where: { id: chat.id } })).not.toBeNull();
    });
});
