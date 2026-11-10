import { status } from '@grpc/grpc-js';
import { Test } from '@nestjs/testing';
import { ServiceTokenClient } from '@examio/auth-jwt';
import { bootAiChatApp, rid, type AiChatTestApp } from './support/ai-chat-test-app';
import { call, chatWith, message, queuedKeys, teacher } from './support/helpers';

/**
 * Deleting a chat: documents go through ONE DeleteDocuments call as the caller (an outage keeps the chat),
 * message images on R2 are queued in r2_delete_tasks in the same transaction as the row delete (never
 * deleted inline), and only the owner's own `images/<userId>/` objects are ever queued.
 */
describe('ai-chat clear / delete (e2e)', () => {
    let t: AiChatTestApp;

    beforeAll(async () => {
        t = await bootAiChatApp();
    });
    afterAll(() => t?.close());

    const deletes = (since: number) => t.document.calls.slice(since).filter((c) => c.rpc === 'DeleteDocuments');

    /** Two documents, one message with an R2 image of the owner, one with an external URL. */
    async function fixture() {
        const user = await teacher(t);
        const a = t.document.add(user.id, { filename: 'a.pdf' });
        const b = t.document.add(user.id, { filename: 'b.pdf' });
        const chat = await chatWith(t, user.id, [a, b].map((d) => ({ id: d.id, name: d.filename })));
        const imageKey = `images/${user.id}/${rid()}.png`;
        await message(t, chat.id, 'user', 'with an R2 image', { imageUrl: `${t.r2PublicBase}/${imageKey}` });
        await message(t, chat.id, 'user', 'with an external image', { imageUrl: 'https://example.com/photo.png' });
        await message(t, chat.id, 'assistant', 'plain');
        return { user, a, b, chat, imageKey };
    }
    const gone = async (chatId: string) => ({
        chat: await t.prisma.aIChat.count({ where: { id: chatId } }),
        messages: await t.prisma.aIChatMessage.count({ where: { chatId } }),
        links: await t.prisma.aIChatDocument.count({ where: { chatId } }),
    });

    describe.each([
        ['DELETE /ai-chat/:id?deleteFiles=true', (id: string, token: string) => call(t.server, 'delete', `/ai-chat/${id}?deleteFiles=true`, token)],
        ['POST /ai-chat/:id/clear {deleteFiles:true}', (id: string, token: string) => call(t.server, 'post', `/ai-chat/${id}/clear`, token, { deleteFiles: true })],
    ])('%s', (_name, run) => {
        it('makes exactly ONE DeleteDocuments([d1,d2]) call as the user, returns both filenames, removes chat, messages and links, queues exactly the R2 image key', async () => {
            const f = await fixture();
            const since = t.document.calls.length;

            const res = await run(f.chat.id, f.user.token);

            expect(res.status).toBeLessThan(300);
            expect(res.body).toMatchObject({ success: true, message: 'Chat và files đã được xóa' });
            expect([...res.body.deletedFiles].sort()).toEqual(['a.pdf', 'b.pdf']);
            expect(deletes(since)).toHaveLength(1);
            expect(deletes(since)[0].caller).toBe(f.user.id); // the user token, not a service token
            expect([...(deletes(since)[0].ids ?? [])].sort()).toEqual([f.a.id, f.b.id].sort());
            expect(await gone(f.chat.id)).toEqual({ chat: 0, messages: 0, links: 0 });
            // the R2 image of the owner is queued; the external URL is not
            expect(await queuedKeys(t, `images/${f.user.id}/`)).toEqual([f.imageKey]);
            expect(t.document.docs.has(f.a.id) || t.document.docs.has(f.b.id)).toBe(false);
        });

        it('document-service UNAVAILABLE is a 503: the chat, its messages and links are kept and NO task row is written; a retry then deletes everything', async () => {
            const f = await fixture();
            t.document.fault('DeleteDocuments', status.UNAVAILABLE, 'STORAGE_UNAVAILABLE');

            const down = await run(f.chat.id, f.user.token);

            expect(down.status).toBe(503);
            expect(await gone(f.chat.id)).toEqual({ chat: 1, messages: 3, links: 2 });
            expect(await queuedKeys(t, `images/${f.user.id}/`)).toEqual([]);
            expect(t.document.docs.has(f.a.id)).toBe(true);

            const retry = await run(f.chat.id, f.user.token);
            expect(retry.status).toBeLessThan(300);
            expect(await gone(f.chat.id)).toEqual({ chat: 0, messages: 0, links: 0 });
            expect(await queuedKeys(t, `images/${f.user.id}/`)).toEqual([f.imageKey]);
        });

        it('a deadline-exceeded answer is also a 503 with the chat kept', async () => {
            const f = await fixture();
            t.document.fault('DeleteDocuments', status.DEADLINE_EXCEEDED, 'slow');
            expect((await run(f.chat.id, f.user.token)).status).toBe(503);
            expect((await gone(f.chat.id)).chat).toBe(1);
        });

        it('a replay after success is a 404 and makes no further DeleteDocuments call', async () => {
            const f = await fixture();
            expect((await run(f.chat.id, f.user.token)).status).toBeLessThan(300);
            const since = t.document.calls.length;

            const replay = await run(f.chat.id, f.user.token);

            expect(replay.status).toBe(404);
            expect(deletes(since)).toHaveLength(0);
            expect(await queuedKeys(t, `images/${f.user.id}/`)).toEqual([f.imageKey]); // not queued twice
        });
    });

    it('deleting a chat WITHOUT deleteFiles makes no DeleteDocuments call, keeps the documents, and still queues the image keys', async () => {
        const f = await fixture();
        const since = t.document.calls.length;

        const res = await call(t.server, 'delete', `/ai-chat/${f.chat.id}`, f.user.token);

        expect(res.body).toEqual({ success: true, message: 'Chat deleted' });
        expect(deletes(since)).toHaveLength(0);
        expect(t.document.calls.slice(since)).toEqual([]);
        expect(t.document.docs.has(f.a.id)).toBe(true);
        expect(await gone(f.chat.id)).toEqual({ chat: 0, messages: 0, links: 0 });
        expect(await queuedKeys(t, `images/${f.user.id}/`)).toEqual([f.imageKey]);
    });

    it('clear with deleteFiles:false behaves like a plain delete (documents kept, images queued)', async () => {
        const f = await fixture();
        const since = t.document.calls.length;
        const res = await call(t.server, 'post', `/ai-chat/${f.chat.id}/clear`, f.user.token, { deleteFiles: false });
        expect(res.body).toMatchObject({ success: true, message: 'Chat đã được xóa' });
        expect(res.body.deletedFiles).toBeUndefined();
        expect(deletes(since)).toHaveLength(0);
        expect(await queuedKeys(t, `images/${f.user.id}/`)).toEqual([f.imageKey]);
    });

    it('a chat without documents does not call document-service even with deleteFiles', async () => {
        const user = await teacher(t);
        const chat = await chatWith(t, user.id);
        const since = t.document.calls.length;
        const res = await call(t.server, 'delete', `/ai-chat/${chat.id}?deleteFiles=true`, user.token);
        expect(res.status).toBeLessThan(300);
        expect(res.body.deletedFiles).toEqual([]);
        expect(t.document.calls.slice(since)).toEqual([]);
    });

    it('deleting a message queues its own image key with the row delete; another user cannot', async () => {
        const user = await teacher(t);
        const stranger = await teacher(t);
        const chat = await chatWith(t, user.id);
        const key = `images/${user.id}/${rid()}.png`;
        const withImage = await message(t, chat.id, 'user', 'pic', { imageUrl: `${t.r2PublicBase}/${key}` });
        const plain = await message(t, chat.id, 'user', 'no pic');

        expect((await call(t.server, 'delete', `/ai-chat/message/${withImage.id}`, stranger.token)).status).toBe(404);
        expect(await queuedKeys(t, `images/${user.id}/`)).toEqual([]);

        expect((await call(t.server, 'delete', `/ai-chat/message/${withImage.id}`, user.token)).body).toEqual({ success: true, message: 'Message deleted' });
        expect((await call(t.server, 'delete', `/ai-chat/message/${plain.id}`, user.token)).status).toBe(200);
        expect(await queuedKeys(t, `images/${user.id}/`)).toEqual([key]);
        expect(await t.prisma.aIChatMessage.count({ where: { chatId: chat.id } })).toBe(0);
    });

    it('never queues what is not the owner\'s own image: an external URL, another user\'s object, another feature\'s object, a lookalike host', async () => {
        const user = await teacher(t);
        const chat = await chatWith(t, user.id);
        const own = `images/${user.id}/own.png`;
        const urls = [
            `${t.r2PublicBase}/${own}`,
            'https://example.com/images/' + user.id + '/external.png',
            `${t.r2PublicBase}/images/someone-else/theirs.png`,
            `${t.r2PublicBase}/avatars/${user.id}/avatar.png`,
            `${t.r2PublicBase}/images/${user.id}/../someone-else/traversal.png`,
            `${t.r2PublicBase.replace('r2.test', 'r2.test.evil')}/images/${user.id}/lookalike.png`,
            'not a url',
        ];
        for (const imageUrl of urls) await message(t, chat.id, 'user', 'm', { imageUrl });

        expect((await call(t.server, 'delete', `/ai-chat/${chat.id}`, user.token)).status).toBe(200);

        expect(await queuedKeys(t, 'images/')).not.toContain('images/someone-else/theirs.png');
        expect(await queuedKeys(t, `images/${user.id}/`)).toEqual([own]);
        expect(await queuedKeys(t, 'avatars/')).toEqual([]);
        expect(await queuedKeys(t, 'images/someone-else/')).toEqual([]);
    });

    it('two deletes racing for one chat: one wins, the other is a 404, and the image is queued exactly once', async () => {
        const f = await fixture();
        const results = await Promise.all([
            call(t.server, 'delete', `/ai-chat/${f.chat.id}`, f.user.token),
            call(t.server, 'delete', `/ai-chat/${f.chat.id}`, f.user.token),
        ]);
        expect(results.map((r) => r.status).sort()).toEqual([200, 404]);
        expect(await queuedKeys(t, `images/${f.user.id}/`)).toEqual([f.imageKey]);
    });

    it('a delete of someone else\'s chat is a 404 and neither calls document-service nor queues anything', async () => {
        const f = await fixture();
        const stranger = await teacher(t);
        const since = t.document.calls.length;
        expect((await call(t.server, 'delete', `/ai-chat/${f.chat.id}?deleteFiles=true`, stranger.token)).status).toBe(404);
        expect(t.document.calls.slice(since)).toEqual([]);
        expect(await gone(f.chat.id)).toEqual({ chat: 1, messages: 3, links: 2 });
        expect(await queuedKeys(t, `images/${f.user.id}/`)).toEqual([]);
    });

    describe('the worker role', () => {
        it('drains the queued key: ONE DeleteObjects([key]) as svc:ai-chat, then the task row is gone; chat code never calls r2 itself', async () => {
            const f = await fixture();
            expect((await call(t.server, 'delete', `/ai-chat/${f.chat.id}?deleteFiles=true`, f.user.token)).status).toBeLessThan(300);
            expect(await queuedKeys(t, `images/${f.user.id}/`)).toEqual([f.imageKey]);
            expect(t.r2.calls.flatMap((c) => c.keys)).not.toContain(f.imageKey); // nothing deleted inline

            const previousPoll = process.env.R2_DELETE_POLL_MS;
            process.env.R2_DELETE_POLL_MS = '50';
            const { WorkerModule } = await import('../src/worker.module');
            const token = await t.serviceToken('ai-chat', 'r2');
            const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] })
                .overrideProvider(ServiceTokenClient)
                .useValue({ getToken: async () => token })
                .compile();
            await moduleRef.init();
            try {
                for (let i = 0; i < 100 && (await queuedKeys(t, `images/${f.user.id}/`)).length > 0; i++) {
                    await new Promise((r) => setTimeout(r, 100));
                }
                expect(await queuedKeys(t, `images/${f.user.id}/`)).toEqual([]);
                const sent = t.r2.calls.filter((c) => c.keys.includes(f.imageKey));
                expect(sent).toHaveLength(1);
                expect(sent[0].caller).toBe('svc:ai-chat');
            } finally {
                await moduleRef.close();
                if (previousPoll === undefined) delete process.env.R2_DELETE_POLL_MS;
                else process.env.R2_DELETE_POLL_MS = previousPoll;
            }
        });
    });
});
