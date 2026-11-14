import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@kmaedu/auth-jwt';
import { AIChatRepository } from './ai-chat.repository';
import { AIChatMessageRepository } from './ai-chat-message.repository';
import { ChatAccessService } from './chat-access.service';
import { newId } from './ids';

/** Chat list/create/rename and message read/edit. Deleting lives in `AIChatDeletionService`. */
@Injectable()
export class AIChatService {
    constructor(
        private readonly chats: AIChatRepository,
        private readonly messages: AIChatMessageRepository,
        private readonly access: ChatAccessService
    ) {}

    async getChats(user: AuthUser) {
        const chats = await this.chats.findByUser(user.id);
        return {
            chats: chats.map((chat) => ({
                id: chat.id,
                userId: chat.userId,
                subjectId: chat.subjectId,
                title: chat.title,
                createdAt: chat.createdAt,
                updatedAt: chat.updatedAt,
                lastMessage: chat.messages[0]?.content || '',
                messageCount: chat._count.messages,
                subject: chat.subject,
            })),
            total: chats.length,
        };
    }

    async createChat(user: AuthUser, title?: string, subjectId?: string) {
        const subject = subjectId ? await this.chats.findSubject(subjectId) : null;
        if (subjectId && !subject) throw new NotFoundException('Subject not found');
        const chat = await this.chats.create({
            id: newId(),
            userId: user.id,
            title: title || subject?.name || '',
            subjectId: subjectId || null,
        });
        return subjectId ? { ...chat, subject } : chat;
    }

    async updateChat(chatId: string, user: AuthUser, title: string) {
        const chat = await this.access.ownedChat(chatId, user);
        return this.chats.updateTitle(chat.id, title);
    }

    /** `exists` is true only for the caller's own chat (another user's chat looks missing). */
    async chatExists(chatId: string, user: AuthUser) {
        return { exists: await this.chats.existsForUser(chatId, user.id) };
    }

    async getMessages(chatId: string, user: AuthUser) {
        await this.access.ownedChat(chatId, user);
        return this.messages.findByChat(chatId);
    }

    async updateMessage(messageId: string, user: AuthUser, content: string) {
        await this.access.ownedMessage(messageId, user);
        return this.messages.updateContent(messageId, content);
    }
}
