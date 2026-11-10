import { Injectable, Logger } from '@nestjs/common';
import type { AuthUser } from '@examio/auth-jwt';
import { AiClient } from '../../clients/ai.client';
import { toAiHttpException } from '../../clients/ai-errors';
import type { OpenedStream } from '../../clients/ai-stream';
import { aiV1 } from '@examio/contracts';
import { AIChatDeletionService } from './ai-chat-deletion.service';
import { AIChatDocumentsService } from './ai-chat-documents.service';
import { AIChatTurnService, type MessageInput } from './ai-chat-turn.service';
import { ChatAccessService, type OwnedChat } from './chat-access.service';
import { regeneratable, resend, type ReplacedMessage } from './regenerate';
import { SseResponse } from './sse-response';
import { pumpFrames, type PumpResult } from './stream-pump';

const SAVE_FAILED = 'Không thể lưu câu trả lời, vui lòng thử lại.';

/**
 * Streaming send (`POST :chatId/stream`) and regenerate (`POST message/:id/regenerate-stream`) over
 * Server-Sent Events, fed by ai-service's server-streaming `StreamChat`.
 *
 * Until the first frame from ai-service everything that fails is a normal HTTP error (404, 429, 502...,
 * thrown to the caller). From then on the stream is committed and a failure is an `event: error` frame.
 */
@Injectable()
export class AIChatStreamService {
    private readonly logger = new Logger(AIChatStreamService.name);

    constructor(
        private readonly turn: AIChatTurnService,
        private readonly documents: AIChatDocumentsService,
        private readonly access: ChatAccessService,
        private readonly deletion: AIChatDeletionService,
        private readonly ai: AiClient
    ) {}

    /** Frames: `started` (send only), `user_message`, `chunk`*, then `done` or an `event: error`. */
    async streamMessage(chatId: string, user: AuthUser, input: MessageInput, userToken: string, sse: SseResponse): Promise<void> {
        return this.run(chatId, user, input, userToken, sse, { announceStart: true });
    }

    /**
     * Streams the answer to the message again (no `started` frame). The message and everything after it
     * are deleted only once the regenerate is admitted and ai-service has opened the stream.
     */
    async regenerateStream(messageId: string, user: AuthUser, userToken: string, sse: SseResponse): Promise<void> {
        const { message, chat } = await this.access.ownedMessage(messageId, user);
        regeneratable(message);
        return this.run(chat.id, user, resend(message), userToken, sse, { announceStart: false, replaces: message });
    }

    private async run(
        chatId: string,
        user: AuthUser,
        input: MessageInput,
        userToken: string,
        sse: SseResponse,
        options: { announceStart: boolean; replaces?: ReplacedMessage }
    ): Promise<void> {
        const commit = () => sse.commit({ started: options.announceStart });
        const { chat, requestedIds } = await this.turn.admit(chatId, user, input, userToken);
        const documentIds = await this.documents.effectiveIds(chat.id, requestedIds);
        // A wait for OCR can take minutes: start the stream (and its heartbeat) first so no proxy gives up.
        await this.documents.ensureReady(documentIds, userToken, commit, sse.signal);
        if (sse.signal.aborted) return;

        const { history, isFirstMessage } = await this.turn.history(chat.id, input.message, options.replaces?.createdAt);
        const stream = await this.open(await this.turn.aiRequest(chat, input, history, documentIds), sse);
        if (!stream) return;

        // A stream that ended by itself (done / error) is left to finish; anything else is cancelled.
        let endedByItself = false;
        try {
            commit();
            if (sse.signal.aborted) return;
            if (options.replaces) await this.deletion.deleteFrom(chat, options.replaces);
            const userMessage = await this.turn.saveUserMessage(chat, input);
            sse.send({ type: 'user_message', data: userMessage });

            const result = await pumpFrames(stream, sse.signal, (frame) => sse.send(frame));
            endedByItself = result.outcome !== 'aborted';
            await this.finish(result, { chat, isFirstMessage, message: input.message }, sse);
        } catch (error) {
            this.logger.error(`Stream of chat ${chatId} failed: ${(error as Error).message}`);
            sse.fail(SAVE_FAILED);
        } finally {
            if (!endedByItself) stream.cancel();
            sse.end();
        }
    }

    /** Opens the gRPC stream; a failure before its first frame is the HTTP error (or, if already committed, an error frame). */
    private async open(request: aiV1.StreamChatRequest, sse: SseResponse): Promise<OpenedStream<aiV1.StreamChatResponse> | undefined> {
        const opening = this.ai.streamChat(request);
        // A client that leaves while the call is still being set up must not leave it running.
        const cancelOnAbort = () => void opening.then((s) => s.cancel(), () => undefined);
        sse.signal.addEventListener('abort', cancelOnAbort, { once: true });
        try {
            return await opening;
        } catch (error) {
            const failure = toAiHttpException(error);
            if (sse.signal.aborted) return undefined;
            if (!sse.committed) throw failure;
            sse.fail((failure.getResponse() as { message: string }).message);
            sse.end();
            return undefined;
        } finally {
            sse.signal.removeEventListener('abort', cancelOnAbort);
        }
    }

    /**
     * Persists the assistant message and closes the stream according to how the stream ended.
     * After a client abort the partial text is kept (the client is gone, so no frame is written).
     */
    private async finish(
        result: PumpResult,
        context: { chat: OwnedChat; isFirstMessage: boolean; message: string },
        sse: SseResponse
    ): Promise<void> {
        const { chat } = context;
        if (result.outcome !== 'done') {
            if (result.text) await this.turn.saveAssistantMessage(chat.id, result.text);
            if (result.outcome === 'error') sse.fail(result.message);
            return;
        }
        const content = result.text || result.finalText || 'No response';
        const assistantMessage = await this.turn.saveAssistantMessage(chat.id, content);
        const { isNewChat } = await this.turn.titleFirstMessage(chat, context.isFirstMessage, context.message);
        sse.send({ type: 'done', data: { assistantMessage, isNewChat } });
    }
}
