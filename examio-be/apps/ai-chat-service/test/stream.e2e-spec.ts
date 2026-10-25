import { status } from '@grpc/grpc-js';
import { bootAiChatApp, rid, type AiChatTestApp } from './support/ai-chat-test-app';
import { chatWith, message, queuedKeys, teacher } from './support/helpers';
import { call } from './support/http';
import { openSse } from './support/sse';
import { DocumentStatus } from './support/fake-document';

/**
 * SSE over the REAL gRPC `AiService.StreamChat`: incremental frames, cancel on client abort, upstream
 * failures (an HTTP status before the first frame, an `event: error` frame after), the service token,
 * and the persistence rules of the assistant message.
 */
describe('ai-chat stream (e2e)', () => {
    let t: AiChatTestApp;

    beforeAll(async () => {
        t = await bootAiChatApp();
    });
    afterAll(() => t?.close());
    beforeEach(() => t.ai.reset());

    const stored = (chatId: string) => t.prisma.aIChatMessage.findMany({ where: { chatId }, orderBy: { createdAt: 'asc' } });
    const eventually = async <T>(read: () => Promise<T | false | undefined>, timeoutMs = 8000): Promise<T> => {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            const value = await read();
            if (value) return value;
            if (Date.now() > deadline) throw new Error('condition not met');
            await new Promise((r) => setTimeout(r, 50));
        }
    };

    it('3 chunks arrive as 3 `data:` frames BEFORE `done`, in order, with the stream headers', async () => {
        const user = await teacher(t);
        const chat = await chatWith(t, user.id);
        t.ai.script = { chunks: ['Hel', 'lo ', 'world'], chunkDelayMs: 250 };

        const sse = await openSse(t.baseUrl, `/ai-chat/${chat.id}/stream`, user.token, { message: 'hi there' });
        // POST handlers answer 201 in Nest and the stream has always done so (the web client only reads `ok`)
        expect(sse.status).toBe(201);
        expect(sse.headers['content-type']).toContain('text/event-stream');
        expect(sse.headers['x-accel-buffering']).toBe('no');
        expect(sse.headers['cache-control']).toContain('no-cache');

        await sse.waitFor((raw) => raw.includes('"data":"Hel"'));
        // the answer is still being produced: no later chunk and no `done` yet
        expect(sse.raw()).not.toContain('"data":"world"');
        expect(sse.raw()).not.toContain('"type":"done"');

        await sse.ended;
        const events = sse.events();
        expect(events.map((e) => e.type)).toEqual(['started', 'user_message', 'chunk', 'chunk', 'chunk', 'done']);
        expect(events.filter((e) => e.type === 'chunk').map((e) => e.data)).toEqual(['Hel', 'lo ', 'world']);
        const done = events.at(-1) as { data: { assistantMessage: { content: string; role: string }; isNewChat: boolean } };
        expect(done.data.assistantMessage).toMatchObject({ role: 'assistant', content: 'Hello world' });
        expect(done.data.isNewChat).toBe(false); // the chat already has a title ('t')
        expect((await stored(chat.id)).map((m) => [m.role, m.content])).toEqual([
            ['user', 'hi there'],
            ['assistant', 'Hello world'],
        ]);
    });

    it('calls ai-service as the SERVICE svc:ai-chat for audience ai, never with the user token; the title comes from the first message', async () => {
        const user = await teacher(t);
        const chat = await t.prisma.aIChat.create({ data: { id: `chat_${rid()}`, userId: user.id, title: '' } });
        t.ai.script = { chunks: ['ok'] };

        const sse = await openSse(t.baseUrl, `/ai-chat/${chat.id}/stream`, user.token, { message: 'What is photosynthesis? '.repeat(5) });
        await sse.ended;

        expect(t.ai.calls).toHaveLength(1);
        expect(t.ai.calls[0]).toMatchObject({ rpc: 'StreamChat', caller: 'svc:ai-chat' });
        expect(t.ai.calls[0].audience).toContain('ai');
        const done = sse.events().at(-1) as { data: { isNewChat: boolean } };
        expect(done.data.isNewChat).toBe(true);
        expect((await t.prisma.aIChat.findUniqueOrThrow({ where: { id: chat.id } })).title).toBe('What is photosynthesis? '.repeat(5).slice(0, 50));
    });

    it('sends the AI teacher prompt to ai-service but never to the client', async () => {
        const user = await teacher(t);
        const category = await t.prisma.subjectCategory.create({ data: { name: `cat ${rid()}`, slug: `cat-${rid()}` } });
        const secret = `SECRET-PROMPT-${rid()}`;
        const subject = await t.prisma.subject.create({
            data: { categoryId: category.id, name: `subj ${rid()}`, slug: `subj-${rid()}`, systemPrompt: secret },
        });
        const chat = await chatWith(t, user.id, [], { subjectId: subject.id });
        t.ai.script = { chunks: ['hi'] };

        const sse = await openSse(t.baseUrl, `/ai-chat/${chat.id}/stream`, user.token, { message: 'teach me', modelType: 'gen-a' });
        await sse.ended;

        expect(t.ai.calls[0].request).toMatchObject({ query: 'teach me', systemPrompt: secret, modelType: 'gen-a' });
        expect(sse.raw()).not.toContain(secret);
    });

    describe('client abort', () => {
        it('cancels the gRPC call (the server sees CANCELLED) and keeps the text produced so far', async () => {
            const user = await teacher(t);
            const chat = await chatWith(t, user.id);
            t.ai.script = { chunks: ['par', 'tial'], chunkDelayMs: 30, end: 'hang' };

            const sse = await openSse(t.baseUrl, `/ai-chat/${chat.id}/stream`, user.token, { message: 'long answer' });
            await sse.waitFor((raw) => raw.includes('"data":"tial"'));
            sse.abort();

            await eventually(async () => t.ai.cancelled.count === 1);
            // HEAD parity: an answer is stored after an abort too (now the partial text; HEAD never cancelled
            // upstream, so it stored the whole answer once the upstream ended).
            const assistant = await eventually(async () => (await stored(chat.id)).find((m) => m.role === 'assistant'));
            expect(assistant.content).toBe('partial');
            expect(t.ai.cancelled.count).toBe(1);
        });

        it('an abort before any chunk stores the user message but no empty assistant message', async () => {
            const user = await teacher(t);
            const chat = await chatWith(t, user.id);
            t.ai.script = { chunks: [], end: 'hang' };

            const sse = await openSse(t.baseUrl, `/ai-chat/${chat.id}/stream`, user.token, { message: 'silence' });
            await sse.waitFor((raw) => raw.includes('"type":"user_message"'));
            sse.abort();

            await eventually(async () => t.ai.cancelled.count === 1);
            await new Promise((r) => setTimeout(r, 300));
            expect((await stored(chat.id)).map((m) => m.role)).toEqual(['user']);
        });
    });

    describe('upstream failures', () => {
        it('an error frame from ai-service after some text is an `event: error` frame; the partial text is kept; no `done`', async () => {
            const user = await teacher(t);
            const chat = await chatWith(t, user.id);
            t.ai.script = { chunks: ['par'], end: 'error-frame' };

            const sse = await openSse(t.baseUrl, `/ai-chat/${chat.id}/stream`, user.token, { message: 'break' });
            await sse.ended;

            expect(sse.raw()).toContain('event: error\ndata: {"type":"error","data":"model fell over (ref e2e)"}\n\n');
            expect(sse.events().map((e) => e.type)).not.toContain('done');
            expect((await stored(chat.id)).map((m) => [m.role, m.content])).toEqual([
                ['user', 'break'],
                ['assistant', 'par'],
            ]);
        });

        it('a gRPC failure mid-stream is an `event: error` frame without the upstream text', async () => {
            const user = await teacher(t);
            const chat = await chatWith(t, user.id);
            t.ai.script = { chunks: ['x'], end: { status: status.INTERNAL, details: 'Traceback /srv/secret.py' } };

            const sse = await openSse(t.baseUrl, `/ai-chat/${chat.id}/stream`, user.token, { message: 'boom' });
            await sse.ended;

            expect(sse.raw()).toContain('event: error');
            expect(sse.raw()).not.toContain('secret.py');
        });

        it.each([
            [status.RESOURCE_EXHAUSTED, 429, 'AI_BUSY'],
            [status.UNAVAILABLE, 503, 'AI_UNAVAILABLE'],
            [status.INVALID_ARGUMENT, 400, 'AI_INVALID_REQUEST'],
        ])('a refusal before the first frame (gRPC %s) is an HTTP %s with a JSON error, nothing is saved', async (code, http, errorCode) => {
            const user = await teacher(t);
            const chat = await chatWith(t, user.id);
            t.ai.script = { failBeforeFirstFrame: { code } };

            const sse = await openSse(t.baseUrl, `/ai-chat/${chat.id}/stream`, user.token, { message: 'hello' });
            await sse.ended;

            expect(sse.status).toBe(http);
            expect(sse.headers['content-type']).toContain('application/json');
            expect(JSON.parse(sse.raw())).toMatchObject({ statusCode: http, code: errorCode });
            expect(await stored(chat.id)).toEqual([]);
        });
    });

    describe('regenerate-stream', () => {
        it('streams without a `started` frame, replaces the message and everything after it', async () => {
            const user = await teacher(t);
            const chat = await chatWith(t, user.id);
            const t0 = Date.now() - 60_000;
            const first = await message(t, chat.id, 'user', 'first question', { createdAt: new Date(t0) });
            await message(t, chat.id, 'assistant', 'first answer', { createdAt: new Date(t0 + 1000) });
            t.ai.script = { chunks: ['new ', 'answer'] };

            const sse = await openSse(t.baseUrl, `/ai-chat/message/${first.id}/regenerate-stream`, user.token);
            await sse.ended;

            expect(sse.status).toBe(201);
            expect(sse.events().map((e) => e.type)).toEqual(['user_message', 'chunk', 'chunk', 'done']);
            expect(t.ai.calls[0].request).toMatchObject({ query: 'first question' });
            expect((await stored(chat.id)).map((m) => [m.role, m.content])).toEqual([
                ['user', 'first question'],
                ['assistant', 'new answer'],
            ]);
            expect(await t.prisma.aIChatMessage.count({ where: { id: first.id } })).toBe(0); // re-created under a new id
        });

        it('only a user message can be regenerated from', async () => {
            const user = await teacher(t);
            const chat = await chatWith(t, user.id);
            const reply = await message(t, chat.id, 'assistant', 'an answer');
            const res = await call(t.server, 'post', `/ai-chat/message/${reply.id}/regenerate-stream`, user.token);
            expect(res.status).toBe(404);
        });

        it('keeps the image of the replayed message and queues the images of the messages that are gone for good', async () => {
            const user = await teacher(t);
            const chat = await chatWith(t, user.id);
            const folder = `${t.r2PublicBase}/images/${user.id}`;
            const t0 = Date.now() - 60_000;
            const first = await message(t, chat.id, 'user', 'look at this', { imageUrl: `${folder}/keep.png`, createdAt: new Date(t0) });
            await message(t, chat.id, 'assistant', 'nice', { createdAt: new Date(t0 + 1000) });
            await message(t, chat.id, 'user', 'and this', { imageUrl: `${folder}/gone.png`, createdAt: new Date(t0 + 2000) });
            t.ai.script = { chunks: ['ok'] };

            const sse = await openSse(t.baseUrl, `/ai-chat/message/${first.id}/regenerate-stream`, user.token);
            await sse.ended;

            expect(await queuedKeys(t, `images/${user.id}/`)).toEqual([`images/${user.id}/gone.png`]);
            const replayed = (await stored(chat.id)).find((m) => m.role === 'user');
            expect(replayed?.imageUrl).toBe(`${folder}/keep.png`);
        });
    });

    describe('documents still being processed', () => {
        it('start the stream (and its heartbeat) at once, wait for the OCR, then call ai-service with the document', async () => {
            const user = await teacher(t);
            const doc = t.document.add(user.id, { processingStatus: DocumentStatus.DOCUMENT_PROCESSING_STATUS_PENDING });
            const chat = await chatWith(t, user.id, [{ id: doc.id, name: doc.filename }]);
            t.ai.script = { chunks: ['from the doc'] };
            const ocr = setTimeout(() => (doc.processingStatus = DocumentStatus.DOCUMENT_PROCESSING_STATUS_COMPLETED), 600);

            try {
                const sse = await openSse(t.baseUrl, `/ai-chat/${chat.id}/stream`, user.token, { message: 'summarize' });
                // the response is open while ai-service has not been called yet
                expect(sse.status).toBe(201);
                expect(sse.raw()).toContain('"type":"started"');
                expect(t.ai.calls).toHaveLength(0);
                await sse.ended;
                expect(t.ai.calls[0].request).toMatchObject({ userStorageId: doc.id });
                expect(sse.events().at(-1)).toMatchObject({ type: 'done' });
            } finally {
                clearTimeout(ocr);
            }
        });
    });
});
