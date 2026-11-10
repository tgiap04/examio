import { call } from './http';
import { rid, type AiChatTestApp, type TestUser } from './ai-chat-test-app';

export interface Teacher extends TestUser {
    token: string;
}

/** A TEACHER (the role that holds `ai_chat:use`) with a token. */
export async function teacher(t: AiChatTestApp): Promise<Teacher> {
    const user = t.createUser(['TEACHER']);
    return { ...user, token: await t.tokenFor(user) };
}

/** A chat of `userId` with the given document links, straight in the database. */
export async function chatWith(t: AiChatTestApp, userId: string, documents: Array<{ id: string; name: string }> = [], over: { subjectId?: string } = {}) {
    const chat = await t.prisma.aIChat.create({ data: { id: `chat_${rid()}`, userId, title: 't', ...over } });
    if (documents.length > 0) {
        await t.prisma.aIChatDocument.createMany({
            data: documents.map((d) => ({ chatId: chat.id, documentId: d.id, documentName: d.name })),
        });
    }
    return chat;
}

export const message = (t: AiChatTestApp, chatId: string, role: 'user' | 'assistant', content: string, over: { imageUrl?: string; createdAt?: Date } = {}) =>
    t.prisma.aIChatMessage.create({ data: { id: `m_${rid()}`, chatId, role, content, ...over } });

export const queuedKeys = async (t: AiChatTestApp, prefix: string): Promise<string[]> =>
    (await t.prisma.$queryRaw<Array<{ key: string }>>`SELECT key FROM r2_delete_tasks WHERE key LIKE ${prefix + '%'} ORDER BY key`).map((r) => r.key);

export { call };
