import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@examio/auth-jwt';
import { AIChatRepository } from './ai-chat.repository';
import { AIChatMessageRepository } from './ai-chat-message.repository';

/** A chat of the caller, with its public subject fields. */
export type OwnedChat = Awaited<ReturnType<ChatAccessService['ownedChat']>>;

/**
 * Owner checks of every chat route. A chat or message of another user is a 404, exactly like one
 * that does not exist: the answer never reveals that someone else's id is real.
 */
@Injectable()
export class ChatAccessService {
    constructor(
        private readonly chats: AIChatRepository,
        private readonly messages: AIChatMessageRepository
    ) {}

    async ownedChat(chatId: string, user: AuthUser) {
        const chat = await this.chats.findById(chatId);
        if (!chat || chat.userId !== user.id) throw new NotFoundException('Chat not found');
        return chat;
    }

    /** The message and its chat, when the chat is the caller's. */
    async ownedMessage(messageId: string, user: AuthUser) {
        const message = await this.messages.findById(messageId);
        if (!message) throw new NotFoundException('Message not found');
        const chat = await this.ownedChat(message.chatId, user).catch((err: unknown) => {
            throw err instanceof NotFoundException ? new NotFoundException('Message not found') : err;
        });
        return { message, chat };
    }
}
