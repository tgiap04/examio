import { bootAiChatApp, rid, type AiChatTestApp, type TestUser } from './support/ai-chat-test-app';
import { chatWith, message } from './support/helpers';
import { call, keysDeep } from './support/http';
import { openSse } from './support/sse';

describe('ai-chat permissions and ownership (e2e)', () => {
    let t: AiChatTestApp;
    let owner: TestUser & { token?: string };
    const tok: Record<string, string> = {};
    let chatId: string;
    let messageId: string;
    const secretPrompt = `TOP-SECRET-PROMPT-${rid()}`;
    let subjectId: string;
    let subjectSlug: string;

    beforeAll(async () => {
        t = await bootAiChatApp();
        owner = t.createUser(['TEACHER']);
        const other = t.createUser(['TEACHER']);
        const student = t.createUser(['STUDENT']);
        const adminOnly = t.createUser(['SYSTEM_ADMIN']);
        for (const [k, u] of Object.entries({ owner, other, student, adminOnly })) tok[k] = await t.tokenFor(u);
        const category = await t.prisma.subjectCategory.create({ data: { name: `Cat ${rid()}`, slug: `cat-${rid()}` } });
        subjectSlug = `subj-${rid()}`;
        const subject = await t.prisma.subject.create({
            data: { categoryId: category.id, name: `Subj ${rid()}`, slug: subjectSlug, systemPrompt: secretPrompt },
        });
        subjectId = subject.id;
        const chat = await chatWith(t, owner.id, [], { subjectId });
        chatId = chat.id;
        messageId = (await message(t, chatId, 'user', 'hello')).id;
    });
    afterAll(() => t?.close());

    describe('another user\'s chat is a 404, never a 403 (no existence oracle)', () => {
        const stream = (p: string) => (token: string) => openSse(t.baseUrl, p, token, { message: 'hi' });

        it.each([
            ['GET', (id: string) => `/ai-chat/${id}/messages`],
            ['PATCH', (id: string) => `/ai-chat/${id}`],
            ['DELETE', (id: string) => `/ai-chat/${id}`],
            ['DELETE', (id: string) => `/ai-chat/${id}?deleteFiles=true`],
            ['POST', (id: string) => `/ai-chat/${id}/clear`],
            ['POST', (id: string) => `/ai-chat/${id}/message`],
            ['GET', (id: string) => `/ai-chat/${id}/documents`],
            ['POST', (id: string) => `/ai-chat/${id}/documents`],
            ['DELETE', (id: string) => `/ai-chat/${id}/documents/d1`],
        ] as const)('%s on someone else\'s chat and on a chat that does not exist answer the same 404', async (method, path) => {
            const body = method === 'PATCH' ? { title: 'x' } : method === 'POST' ? { message: 'hi', documentId: 'd1', documentName: 'a.pdf' } : undefined;
            const verb = method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete';
            const foreign = await call(t.server, verb, path(chatId), tok.other, body);
            const missing = await call(t.server, verb, path(`missing_${rid()}`), tok.other, body);
            expect([foreign.status, missing.status]).toEqual([404, 404]);
            expect(foreign.body).toEqual(missing.body);
        });

        it('POST :chatId/stream of another user is a JSON 404 before any stream starts, and saves nothing', async () => {
            const sse = await stream(`/ai-chat/${chatId}/stream`)(tok.other);
            await sse.ended;
            expect(sse.status).toBe(404);
            expect(sse.headers['content-type']).toContain('application/json');
            expect(t.ai.calls).toHaveLength(0);
        });

        it('GET :chatId/exists is true only for the owner; another teacher sees false, never the existence', async () => {
            const p = `/ai-chat/${chatId}/exists`;
            expect((await call(t.server, 'get', p, tok.owner)).body).toEqual({ exists: true });
            expect((await call(t.server, 'get', p, tok.other)).body).toEqual({ exists: false });
        });

        it.each([
            ['PATCH', (id: string) => `/ai-chat/message/${id}`, { content: 'x' }],
            ['DELETE', (id: string) => `/ai-chat/message/${id}`, undefined],
            ['POST', (id: string) => `/ai-chat/message/${id}/regenerate`, undefined],
            ['POST', (id: string) => `/ai-chat/message/${id}/regenerate-stream`, undefined],
        ] as const)('%s on someone else\'s message is a 404 and changes nothing', async (method, path, body) => {
            const verb = method.toLowerCase() as 'post' | 'patch' | 'delete';
            const res = await call(t.server, verb, path(messageId), tok.other, body);
            expect(res.status).toBe(404);
            expect(await t.prisma.aIChatMessage.findUnique({ where: { id: messageId } })).toMatchObject({ content: 'hello' });
            expect(await t.prisma.aIChat.count({ where: { id: chatId } })).toBe(1);
        });

        it('the owner is served', async () => {
            expect((await call(t.server, 'get', `/ai-chat/${chatId}/messages`, tok.owner)).status).toBe(200);
        });
    });

    describe('permissions', () => {
        it('a STUDENT gets 403 on every /ai-chat route, and so does an admin without the teacher role', async () => {
            for (const token of [tok.student, tok.adminOnly]) {
                for (const [method, path, body] of [
                    ['get', '/ai-chat'],
                    ['post', '/ai-chat', {}],
                    ['get', `/ai-chat/${chatId}/exists`],
                    ['get', `/ai-chat/${chatId}/messages`],
                    ['post', `/ai-chat/${chatId}/message`, { message: 'x' }],
                    ['delete', `/ai-chat/${chatId}`],
                    ['patch', `/ai-chat/message/${messageId}`, { content: 'x' }],
                ] as const) {
                    expect([method, path, (await call(t.server, method, path, token, body)).status]).toEqual([method, path, 403]);
                }
                const sse = await openSse(t.baseUrl, `/ai-chat/${chatId}/stream`, token, { message: 'x' });
                await sse.ended;
                expect(sse.status).toBe(403);
            }
            expect(t.ai.calls).toHaveLength(0);
        });

        it('anonymous is 401 on /ai-chat', async () => {
            expect((await call(t.server, 'get', '/ai-chat')).status).toBe(401);
            expect((await call(t.server, 'get', `/ai-chat/${chatId}/exists`)).status).toBe(401);
        });

        it('anonymous GET /subjects is 200 (and so are the other three public routes)', async () => {
            for (const path of ['/subjects', '/subjects/categories', `/subjects/${subjectId}`, `/subjects/slug/${subjectSlug}`]) {
                expect([path, (await call(t.server, 'get', path)).status]).toEqual([path, 200]);
            }
        });

        it('an unknown subject is a 404', async () => {
            expect((await call(t.server, 'get', `/subjects/missing_${rid()}`)).status).toBe(404);
            expect((await call(t.server, 'get', '/subjects/slug/no-such-subject')).status).toBe(404);
        });
    });

    describe('what responses never contain', () => {
        it('no `email` and no `systemPrompt` key (and not the prompt text) in any ai-chat or subjects response', async () => {
            const created = await call(t.server, 'post', '/ai-chat', tok.owner, { subjectId });
            const bodies: unknown[] = [created.body];
            for (const [path, token] of [
                ['/subjects', undefined],
                ['/subjects/categories', undefined],
                [`/subjects/${subjectId}`, undefined],
                [`/subjects/slug/${subjectSlug}`, undefined],
                ['/ai-chat', tok.owner],
                [`/ai-chat/${chatId}/messages`, tok.owner],
                [`/ai-chat/${chatId}/documents`, tok.owner],
            ] as const) {
                const res = await call(t.server, 'get', path, token);
                expect([path, res.status]).toEqual([path, 200]);
                bodies.push(res.body);
            }
            const patched = await call(t.server, 'patch', `/ai-chat/${chatId}`, tok.owner, { title: 'renamed' });
            bodies.push(patched.body);

            expect(created.status).toBe(201);
            for (const body of bodies) {
                const keys = keysDeep(body);
                expect(keys.has('email')).toBe(false);
                expect(keys.has('systemPrompt')).toBe(false);
                expect(JSON.stringify(body)).not.toContain(secretPrompt);
            }
            // the flat list is the one that used to carry every column of the subject
            const flat = (await call(t.server, 'get', '/subjects')).body.subjects as Array<Record<string, unknown>>;
            expect(flat.find((s) => s.id === subjectId)).toBeDefined();
            expect(flat.every((s) => !('systemPrompt' in s))).toBe(true);
        });

        it('the chat list keeps the shape the web client reads (subject summary, last message, counts)', async () => {
            const res = await call(t.server, 'get', '/ai-chat', tok.owner);
            const chat = res.body.chats.find((c: { id: string }) => c.id === chatId);
            expect(chat).toMatchObject({
                id: chatId,
                userId: owner.id,
                subjectId,
                lastMessage: 'hello',
                messageCount: 1,
                subject: { id: subjectId, slug: subjectSlug },
            });
            expect(Object.keys(chat.subject).sort()).toEqual(['color', 'icon', 'id', 'name', 'slug']);
            expect(res.body.total).toBe(res.body.chats.length);
        });
    });

    describe('input validation', () => {
        it('rejects a message above the ai-service limit and a malformed body with 400', async () => {
            expect((await call(t.server, 'post', `/ai-chat/${chatId}/message`, tok.owner, { message: 'x'.repeat(8001) })).status).toBe(400);
            expect((await call(t.server, 'post', `/ai-chat/${chatId}/message`, tok.owner, {})).status).toBe(400);
            expect((await call(t.server, 'post', `/ai-chat/${chatId}/documents`, tok.owner, { documentId: '' , documentName: 'a' })).status).toBe(400);
            expect((await call(t.server, 'delete', `/ai-chat/${chatId}?deleteFiles=maybe`, tok.owner)).status).toBe(400);
            expect(t.ai.calls).toHaveLength(0);
        });

        it('creating a chat for a subject that does not exist is a 404', async () => {
            expect((await call(t.server, 'post', '/ai-chat', tok.owner, { subjectId: `missing_${rid()}` })).status).toBe(404);
        });
    });
});
