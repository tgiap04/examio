import { Injectable } from '@nestjs/common';
import type { AuthUser } from '@examio/auth-jwt';
import { aiV1 } from '@examio/contracts';
import { HISTORY_CONTENT_MAX_CHARS, HISTORY_FETCH_LIMIT, HISTORY_KEEP } from '../../config/ai-chat.constants';
import { AIChatRepository } from './ai-chat.repository';
import { AIChatMessageRepository } from './ai-chat-message.repository';
import { AIChatDocumentsService } from './ai-chat-documents.service';
import { AIChatLimitsService } from './ai-chat-limits.service';
import { ChatAccessService, type OwnedChat } from './chat-access.service';
import { newId } from './ids';

export interface MessageInput {
    message: string;
    imageUrl?: string;
    documentId?: string;
    documentIds?: string[];
    documentName?: string;
    modelType?: string;
}

/** The steps a message goes through before and after the AI call; shared by the plain and the streaming flow. */
@Injectable()
export class AIChatTurnService {
    constructor(
        private readonly access: ChatAccessService,
        private readonly limits: AIChatLimitsService,
        private readonly documents: AIChatDocumentsService,
        private readonly chats: AIChatRepository,
        private readonly messages: AIChatMessageRepository
    ) {}

    /**
     * Everything that can still be refused with an HTTP status, before anything is saved or sent:
     * the chat is the caller's, the plan's limits allow it, and every document the message names is
     * the caller's (before it may influence the AI context).
     */
    async admit(chatId: string, user: AuthUser, input: MessageInput, userToken: string) {
        const chat = await this.access.ownedChat(chatId, user);
        await this.limits.assertCanSend(user.id, chat.id, userToken);
        const requestedIds = [...new Set([...(input.documentIds ?? []), ...(input.documentId ? [input.documentId] : [])])];
        await this.documents.assertOwned(requestedIds, userToken);
        return { chat, requestedIds };
    }

    /** The last messages as the model gets them (the new user message last), and whether this is the chat's first. */
    async history(chatId: string, message: string): Promise<{ history: aiV1.ChatMessage[]; isFirstMessage: boolean }> {
        const recent = await this.messages.findRecent(chatId, HISTORY_FETCH_LIMIT);
        const history = [...recent.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: message }]
            .slice(-HISTORY_KEEP)
            .map(({ role, content }) => ({
                role,
                content: content.length > HISTORY_CONTENT_MAX_CHARS ? `${content.slice(0, HISTORY_CONTENT_MAX_CHARS).trim()} ...` : content,
            }));
        return { history, isFirstMessage: recent.length === 0 };
    }

    /** The AI teacher's prompt of the chat's subject. It goes to ai-service only, never to a client. */
    systemPromptOf(chat: OwnedChat): Promise<string | null> {
        return chat.subjectId ? this.chats.findSubjectPrompt(chat.subjectId) : Promise.resolve(null);
    }

    saveUserMessage(chat: OwnedChat, input: MessageInput) {
        return this.messages.create({
            id: newId(),
            chatId: chat.id,
            role: 'user',
            content: input.message,
            imageUrl: input.imageUrl,
            documentId: input.documentId,
            documentName: input.documentName,
        });
    }

    saveAssistantMessage(chatId: string, content: string) {
        return this.messages.create({ id: newId(), chatId, role: 'assistant', content });
    }

    /** A chat without a title takes the first 50 characters of its first message. Returns the title now in effect. */
    async titleFirstMessage(chat: OwnedChat, isFirstMessage: boolean, message: string): Promise<{ title: string; isNewChat: boolean }> {
        const isNewChat = isFirstMessage && !chat.title;
        if (!isNewChat) return { title: chat.title, isNewChat };
        const title = message.slice(0, 50);
        await this.chats.updateTitle(chat.id, title);
        return { title, isNewChat };
    }
}
