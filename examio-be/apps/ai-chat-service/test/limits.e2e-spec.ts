import { bootAiChatApp, rid, type AiChatTestApp } from './support/ai-chat-test-app';
import { FREE } from './support/fake-finance';
import { call, chatWith, teacher } from './support/helpers';

/** Subscription limits: `GetUserBenefits` as the caller, cached `aichat:benefits:<id>` for 5 minutes. */
describe('ai-chat limits (e2e)', () => {
    let t: AiChatTestApp;

    beforeAll(async () => {
        t = await bootAiChatApp();
    });
    afterAll(() => t?.close());
    beforeEach(() => t.ai.reset());

    const send = (token: string, chatId: string, text = 'hi') => call(t.server, 'post', `/ai-chat/${chatId}/message`, token, { message: text });
    const key = (userId: string) => `aichat:benefits:${userId}`;

    it('free tier: the 6th message within a minute is a 429, the first five go through', async () => {
        const user = await teacher(t);
        t.finance.setBenefits(user.id, FREE);
        const chat = await chatWith(t, user.id);

        const statuses: number[] = [];
        for (let i = 0; i < 6; i++) statuses.push((await send(user.token, chat.id, `m${i}`)).status);

        expect(statuses.slice(0, 5).every((s) => s < 300)).toBe(true);
        expect(statuses[5]).toBe(429);
        const refused = await send(user.token, chat.id, 'again');
        expect(refused.body).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
        expect(await t.prisma.aIChatMessage.count({ where: { chatId: chat.id, role: 'user' } })).toBe(5);
    });

    it('asks finance AS the caller once, then serves the plan from Redis for 5 minutes', async () => {
        const user = await teacher(t);
        t.finance.setBenefits(user.id, { messagesPerMinute: 100 });
        const chat = await chatWith(t, user.id);

        await send(user.token, chat.id);
        await send(user.token, chat.id);

        const asked = t.finance.calls.filter((c) => c.userId === user.id);
        expect(asked).toEqual([{ userId: user.id, caller: user.id }]);
        const cached = await t.redis.get<{ messagesPerMinute: number }>(key(user.id));
        expect(cached).toMatchObject({ messagesPerMinute: 100 });
        const ttl = await t.redis.getClient().ttl(key(user.id));
        expect(ttl).toBeGreaterThan(280);
        expect(ttl).toBeLessThanOrEqual(300);
    });

    it('deleting the cache key (what finance.subscription.changed does) makes the next message read the new plan', async () => {
        const user = await teacher(t);
        t.finance.setBenefits(user.id, FREE);
        const chat = await chatWith(t, user.id);
        for (let i = 0; i < 5; i++) await send(user.token, chat.id);
        expect((await send(user.token, chat.id)).status).toBe(429);

        t.finance.setBenefits(user.id, { messagesPerMinute: 100 });
        expect((await send(user.token, chat.id)).status).toBe(429); // still the cached Free plan
        await t.redis.del(key(user.id));
        expect((await send(user.token, chat.id)).status).toBeLessThan(300);
    });

    it('a chat that reached its message cap is a 403 (a new chat is needed)', async () => {
        const user = await teacher(t);
        t.finance.setBenefits(user.id, { messagesPerMinute: 100, chatMessagesLimit: 2 });
        const chat = await chatWith(t, user.id);
        expect((await send(user.token, chat.id)).status).toBeLessThan(300);
        expect((await send(user.token, chat.id)).status).toBeLessThan(300);
        const full = await send(user.token, chat.id);
        expect(full.status).toBe(403);
        expect(full.body).toMatchObject({ code: 'CHAT_LIMIT_REACHED' });
    });

    it('unlimited plans (-1) are never throttled', async () => {
        const user = await teacher(t);
        t.finance.setBenefits(user.id, { messagesPerMinute: -1, chatMessagesLimit: -1 });
        const chat = await chatWith(t, user.id);
        for (let i = 0; i < 8; i++) expect((await send(user.token, chat.id)).status).toBeLessThan(300);
    });

    it('fails SAFE when finance is down: Free limits apply and the fallback is not cached', async () => {
        const user = await teacher(t);
        const chat = await chatWith(t, user.id);
        t.finance.down.value = true;
        try {
            const statuses: number[] = [];
            for (let i = 0; i < 6; i++) statuses.push((await send(user.token, chat.id, `m${rid()}`)).status);
            expect(statuses.slice(0, 5).every((s) => s < 300)).toBe(true);
            expect(statuses[5]).toBe(429);
            expect(await t.redis.get(key(user.id))).toBeNull();
        } finally {
            t.finance.down.value = false;
        }
    });
});
