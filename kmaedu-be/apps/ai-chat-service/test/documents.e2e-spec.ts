import { status } from '@grpc/grpc-js';
import { bootAiChatApp, type AiChatTestApp } from './support/ai-chat-test-app';
import { DocumentStatus } from './support/fake-document';
import { call, chatWith, teacher } from './support/helpers';

/**
 * Chat documents: every document-service call is made AS the caller (never as a service), a document
 * that is not the caller's is a 404, listing is ONE batched call, and a message waits (bounded) for OCR.
 */
describe('ai-chat documents (e2e)', () => {
    let t: AiChatTestApp;

    beforeAll(async () => {
        t = await bootAiChatApp();
    });
    afterAll(() => t?.close());
    beforeEach(() => t.ai.reset());

    const callsOf = (rpc: string, since: number) => t.document.calls.slice(since).filter((c) => c.rpc === rpc);

    it('attaching a document asserts ownership as the caller; a foreign document is a 404 and is not linked', async () => {
        const user = await teacher(t);
        const other = await teacher(t);
        const mine = t.document.add(user.id, { filename: 'mine.pdf' });
        const theirs = t.document.add(other.id, { filename: 'theirs.pdf' });
        const chat = await chatWith(t, user.id);
        const since = t.document.calls.length;

        const ok = await call(t.server, 'post', `/ai-chat/${chat.id}/documents`, user.token, { documentId: mine.id, documentName: 'mine.pdf' });
        const bad = await call(t.server, 'post', `/ai-chat/${chat.id}/documents`, user.token, { documentId: theirs.id, documentName: 'theirs.pdf' });

        expect(ok.status).toBeLessThan(300);
        expect(ok.body).toMatchObject({ chatId: chat.id, documentId: mine.id, documentName: 'mine.pdf' });
        expect(bad.status).toBe(404); // AssertOwnership NOT_FOUND
        expect(callsOf('AssertOwnership', since).map((c) => [c.caller, c.ids])).toEqual([
            [user.id, [mine.id]],
            [user.id, [theirs.id]],
        ]);
        expect((await t.prisma.aIChatDocument.findMany({ where: { chatId: chat.id } })).map((d) => d.documentId)).toEqual([mine.id]);
    });

    it('attaching the same document twice keeps one link (and updates its name)', async () => {
        const user = await teacher(t);
        const doc = t.document.add(user.id);
        const chat = await chatWith(t, user.id);
        for (const name of ['first.pdf', 'second.pdf']) {
            await call(t.server, 'post', `/ai-chat/${chat.id}/documents`, user.token, { documentId: doc.id, documentName: name });
        }
        const links = await t.prisma.aIChatDocument.findMany({ where: { chatId: chat.id } });
        expect(links.map((l) => l.documentName)).toEqual(['second.pdf']);
    });

    it('document-service unavailable while attaching is a 503, not a link', async () => {
        const user = await teacher(t);
        const doc = t.document.add(user.id);
        const chat = await chatWith(t, user.id);
        // an idempotent read is retried: three failures make it an outage
        for (let i = 0; i < 3; i++) t.document.fault('AssertOwnership', status.UNAVAILABLE, 'STORAGE_UNAVAILABLE');
        const res = await call(t.server, 'post', `/ai-chat/${chat.id}/documents`, user.token, { documentId: doc.id, documentName: 'a.pdf' });
        expect(res.status).toBe(503);
        expect(await t.prisma.aIChatDocument.count({ where: { chatId: chat.id } })).toBe(0);
    });

    it('listing N documents is exactly ONE GetDocumentsByIds call, shows live names, and drops links to documents that are gone', async () => {
        const user = await teacher(t);
        const docs = Array.from({ length: 4 }, (_, i) => t.document.add(user.id, { filename: `live-${i}.pdf` }));
        const chat = await chatWith(t, user.id, [
            ...docs.map((d) => ({ id: d.id, name: `stale-${d.id}` })),
            { id: 'doc_deleted_long_ago', name: 'ghost.pdf' },
        ]);
        const since = t.document.calls.length;

        const res = await call(t.server, 'get', `/ai-chat/${chat.id}/documents`, user.token);

        expect(res.status).toBe(200);
        expect(callsOf('GetDocumentsByIds', since)).toHaveLength(1);
        expect(t.document.calls.slice(since)).toHaveLength(1);
        expect(callsOf('GetDocumentsByIds', since)[0]).toMatchObject({ caller: user.id });
        expect([...(callsOf('GetDocumentsByIds', since)[0].ids ?? [])].sort()).toEqual([...docs.map((d) => d.id), 'doc_deleted_long_ago'].sort());
        expect(res.body).toHaveLength(4);
        expect(res.body.map((d: { documentName: string }) => d.documentName).sort()).toEqual(['live-0.pdf', 'live-1.pdf', 'live-2.pdf', 'live-3.pdf']);
        for (const entry of res.body) expect(Object.keys(entry).sort()).toEqual(['documentId', 'documentName']);
    });

    it('listing an empty chat makes no document-service call; an outage falls back to the stored links', async () => {
        const user = await teacher(t);
        const empty = await chatWith(t, user.id);
        const since = t.document.calls.length;
        expect((await call(t.server, 'get', `/ai-chat/${empty.id}/documents`, user.token)).body).toEqual([]);
        expect(t.document.calls.slice(since)).toEqual([]);

        const doc = t.document.add(user.id);
        const chat = await chatWith(t, user.id, [{ id: doc.id, name: 'stored.pdf' }]);
        for (let i = 0; i < 3; i++) t.document.fault('GetDocumentsByIds', status.UNAVAILABLE, 'STORAGE_UNAVAILABLE');
        const res = await call(t.server, 'get', `/ai-chat/${chat.id}/documents`, user.token);
        expect(res.status).toBe(200);
        expect(res.body).toEqual([{ documentId: doc.id, documentName: 'stored.pdf' }]);
    });

    it('removing a link keeps the document itself', async () => {
        const user = await teacher(t);
        const doc = t.document.add(user.id);
        const chat = await chatWith(t, user.id, [{ id: doc.id, name: 'x.pdf' }]);
        const res = await call(t.server, 'delete', `/ai-chat/${chat.id}/documents/${doc.id}`, user.token);
        expect(res.body).toEqual({ success: true });
        expect(await t.prisma.aIChatDocument.count({ where: { chatId: chat.id } })).toBe(0);
        expect(t.document.docs.has(doc.id)).toBe(true);
    });

    it('sending a message reads the chat documents, re-queues only the PENDING / FAILED ones, then waits for their OCR before answering', async () => {
        const user = await teacher(t);
        const done = t.document.add(user.id, { processingStatus: DocumentStatus.DOCUMENT_PROCESSING_STATUS_COMPLETED });
        const failed = t.document.add(user.id, { processingStatus: DocumentStatus.DOCUMENT_PROCESSING_STATUS_FAILED });
        const pending = t.document.add(user.id, { processingStatus: DocumentStatus.DOCUMENT_PROCESSING_STATUS_PENDING });
        const chat = await chatWith(t, user.id, [done, failed, pending].map((d) => ({ id: d.id, name: d.filename })));
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
        // ONE read of every chat document, then polls of the not-yet-COMPLETED ones only
        const reads = callsOf('GetDocumentsByIds', since);
        expect(reads.length).toBeGreaterThanOrEqual(2);
        expect([...(reads[0].ids ?? [])].sort()).toEqual([done.id, failed.id, pending.id].sort());
        for (const poll of reads.slice(1)) expect([...(poll.ids ?? [])].sort()).toEqual([failed.id, pending.id].sort());
        expect(reads.every((c) => c.caller === user.id)).toBe(true);
        expect(callsOf('EnsureProcessed', since).map((c) => c.ids?.[0]).sort()).toEqual([failed.id, pending.id].sort());
        expect(callsOf('AssertOwnership', since)).toHaveLength(0);
        expect(t.document.calls.slice(since).every((c) => !c.caller.startsWith('svc:'))).toBe(true);
        // the answer was produced after the wait, with the first document as context
        expect(t.ai.calls[0]).toMatchObject({ rpc: 'Query', caller: 'svc:ai-chat' });
        expect(t.ai.calls[0].request).toMatchObject({ userStorageId: done.id });
    });

    it('a document id the caller does not own is refused (404) before anything is saved or sent', async () => {
        const user = await teacher(t);
        const other = await teacher(t);
        const theirs = t.document.add(other.id);
        const chat = await chatWith(t, user.id);

        const res = await call(t.server, 'post', `/ai-chat/${chat.id}/message`, user.token, { message: 'hi', documentId: theirs.id });

        expect(res.status).toBe(404);
        expect(await t.prisma.aIChatMessage.count({ where: { chatId: chat.id } })).toBe(0);
        expect(t.ai.calls).toHaveLength(0);
    });

    it('answers a plain message with the apology text when the model is merely down, and stores both messages', async () => {
        const user = await teacher(t);
        const chat = await chatWith(t, user.id);
        t.ai.query.fail = { code: status.UNAVAILABLE, details: 'model down' };
        const res = await call(t.server, 'post', `/ai-chat/${chat.id}/message`, user.token, { message: 'hello' });
        expect(res.status).toBeLessThan(300);
        expect(res.body.assistantMessage.content).toContain('Xin lỗi');
        expect(res.body).toMatchObject({ success: true, userMessage: { content: 'hello' }, chatTitle: 't' });
    });

    it('a plain message that ai-service refuses for capacity is a 429 and stores nothing', async () => {
        const user = await teacher(t);
        const chat = await chatWith(t, user.id);
        t.ai.query.fail = { code: status.RESOURCE_EXHAUSTED, details: 'busy' };
        const res = await call(t.server, 'post', `/ai-chat/${chat.id}/message`, user.token, { message: 'hello' });
        expect(res.status).toBe(429);
        expect(await t.prisma.aIChatMessage.count({ where: { chatId: chat.id } })).toBe(0);
    });
});
