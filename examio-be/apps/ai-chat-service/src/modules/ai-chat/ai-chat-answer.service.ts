import { Injectable, Logger } from '@nestjs/common';
import type { AuthUser } from '@examio/auth-jwt';
import { AiClient } from '../../clients/ai.client';
import { shouldSurfaceAiFailure, toAiHttpException } from '../../clients/ai-errors';
import { AIChatDeletionService } from './ai-chat-deletion.service';
import { AIChatDocumentsService } from './ai-chat-documents.service';
import { AIChatTurnService, type MessageInput } from './ai-chat-turn.service';
import { ChatAccessService } from './chat-access.service';
import { regeneratable, resend } from './regenerate';

const APOLOGY = 'Xin lỗi, có lỗi xảy ra khi xử lý câu hỏi của bạn.';

/** The non-streaming send (`POST :chatId/message`) and regenerate. */
@Injectable()
export class AIChatAnswerService {
    private readonly logger = new Logger(AIChatAnswerService.name);

    constructor(
        private readonly turn: AIChatTurnService,
        private readonly documents: AIChatDocumentsService,
        private readonly access: ChatAccessService,
        private readonly deletion: AIChatDeletionService,
        private readonly ai: AiClient
    ) {}

    async sendMessage(chatId: string, user: AuthUser, input: MessageInput, userToken: string) {
        const { chat, requestedIds } = await this.turn.admit(chatId, user, input, userToken);
        const documentIds = await this.documents.effectiveIds(chat.id, requestedIds);
        await this.documents.ensureReady(documentIds, userToken);
        const { history, isFirstMessage } = await this.turn.history(chat.id, input.message);

        let answer: string;
        try {
            const response = await this.ai.query({ query: input.message, history, userStorageId: documentIds[0] });
            answer = response.answer || 'No response';
        } catch (error) {
            if (shouldSurfaceAiFailure(error)) throw toAiHttpException(error);
            this.logger.error(`Error calling AI service: ${(error as Error).message}`);
            answer = APOLOGY;
        }

        const userMessage = await this.turn.saveUserMessage(chat, input);
        const assistantMessage = await this.turn.saveAssistantMessage(chat.id, answer);
        const { title } = await this.turn.titleFirstMessage(chat, isFirstMessage, input.message);
        return { success: true, userMessage, assistantMessage, chatTitle: title };
    }

    /** Deletes the message and everything after it, then sends the message again. */
    async regenerateFromMessage(messageId: string, user: AuthUser, userToken: string) {
        const { message, chat } = await this.access.ownedMessage(messageId, user);
        regeneratable(message);
        await this.deletion.deleteFrom(chat, message);
        return this.sendMessage(chat.id, user, resend(message), userToken);
    }
}
