import { bootAiChatApp, type AiChatTestApp } from './support/ai-chat-test-app';
import { chatWith, teacher } from './support/helpers';
import { call } from './support/http';
import { openSse } from './support/sse';

/**
 * Own file on purpose: the gRPC client registrations read their URLs when the module is first
 * imported, so a second app with other fakes needs a fresh module registry (one jest file each).
 */
describe('ai-chat with a misconfigured service token (e2e)', () => {
    let t: AiChatTestApp;

    beforeAll(async () => {
        t = await bootAiChatApp({ serviceToken: 'user' });
    });
    afterAll(() => t?.close());

    it('a user token reaching ai-service is PERMISSION_DENIED and surfaces as a 502, not a silent success', async () => {
        const user = await teacher(t);
        const chat = await chatWith(t, user.id);

        const sse = await openSse(t.baseUrl, `/ai-chat/${chat.id}/stream`, user.token, { message: 'hello' });
        await sse.ended;

        expect(sse.status).toBe(502);
        expect(JSON.parse(sse.raw())).toMatchObject({ statusCode: 502, code: 'AI_UPSTREAM_REJECTED' });
        expect(t.ai.calls[0].caller).toBe('u_misconfigured');
        expect(await t.prisma.aIChatMessage.count({ where: { chatId: chat.id } })).toBe(0);
    });

    it('the plain /message route fails loudly the same way (no apology message stored as a success)', async () => {
        const user = await teacher(t);
        const chat = await chatWith(t, user.id);
        const res = await call(t.server, 'post', `/ai-chat/${chat.id}/message`, user.token, { message: 'hello' });
        expect(res.status).toBe(502);
        expect(await t.prisma.aIChatMessage.count({ where: { chatId: chat.id } })).toBe(0);
    });
});
