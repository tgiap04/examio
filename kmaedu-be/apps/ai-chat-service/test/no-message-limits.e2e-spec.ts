import { bootAiChatApp, type AiChatTestApp } from './support/ai-chat-test-app';
import { call, chatWith, teacher } from './support/helpers';

/**
 * There are no subscription limits any more: no per-minute rate (was 429 RATE_LIMITED for the 6th
 * message of the Free plan) and no per-chat cap (was 403 CHAT_LIMIT_REACHED at 30). Ownership checks stay.
 */
describe('ai-chat without message limits (e2e)', () => {
    let t: AiChatTestApp;

    beforeAll(async () => {
        t = await bootAiChatApp();
    });
    afterAll(() => t?.close());
    beforeEach(() => t.ai.reset());

    const send = (token: string, chatId: string, text = 'hi') => call(t.server, 'post', `/ai-chat/${chatId}/message`, token, { message: text });

    it('31 messages back to back in one chat are all answered (no 429 at the 6th, no 403 at the 31st)', async () => {
        const user = await teacher(t);
        const chat = await chatWith(t, user.id);

        const statuses: number[] = [];
        for (let i = 0; i < 31; i++) statuses.push((await send(user.token, chat.id, `m${i}`)).status);

        expect(statuses.filter((s) => s >= 300)).toEqual([]);
        expect(await t.prisma.aIChatMessage.count({ where: { chatId: chat.id, role: 'user' } })).toBe(31);
        expect(await t.redis.getClient().keys(`aichat:benefits:${user.id}`)).toEqual([]);
    });

    it('another user still cannot write into the chat (404)', async () => {
        const owner = await teacher(t);
        const intruder = await teacher(t);
        const chat = await chatWith(t, owner.id);
        expect((await send(intruder.token, chat.id)).status).toBe(404);
        expect(await t.prisma.aIChatMessage.count({ where: { chatId: chat.id } })).toBe(0);
    });
});
