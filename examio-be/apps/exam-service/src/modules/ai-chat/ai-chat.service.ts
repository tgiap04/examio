import {
    Injectable,
    Logger,
    NotFoundException,
    ForbiddenException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, Observable, Subject } from 'rxjs';
import { buildMetadata, FinanceClient } from '@examio/grpc';
import { subscriptionV1 } from '@examio/contracts';
import { AIChatRepository } from './ai-chat.repository';
import { documentV1 } from '@examio/contracts';
import { PrismaService } from '../../prisma';
import type { AuthUser } from '@examio/auth-jwt';
import { DocumentClient, userMetadata } from '../../clients/document.client';
import {
    isGrpcStatus,
    isGrpcUnavailable,
    toDocumentHttpException,
} from '../../clients/document-errors';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { resolveDocumentWaitMs, waitForDocuments } from './ai-chat-document-wait';

const DocStatus = documentV1.DocumentProcessingStatus;


@Injectable()
export class AIChatService {
    private readonly logger = new Logger(AIChatService.name);
    private readonly aiServiceUrl =
        process.env.AI_SERVICE_URL || 'http://localhost:8000/api';
    /**
     * trimHistoryForAI only keeps the last 4 messages for AI context, so we
     * fetch a small buffer beyond that (6) instead of the full chat history,
     * which would otherwise grow unbounded with conversation length.
     */
    private readonly aiHistoryFetchLimit = 6;
    /** `AI_CHAT_DOCUMENT_WAIT_MS`: how long one message waits for its documents' OCR. */
    private readonly documentWaitMs = resolveDocumentWaitMs(process.env, this.logger);

    constructor(
        private readonly chatRepository: AIChatRepository,
        private readonly httpService: HttpService,
        private readonly finance: FinanceClient,
        private readonly prisma: PrismaService,
        private readonly documents: DocumentClient
    ) {}

    /**
     * Headers required by the Python AI service internal-token middleware.
     * Every call to the AI service MUST carry this header or it returns 401.
     */
    private get internalHeaders() {
        return {
            'x-internal-service-token':
                process.env.INTERNAL_SERVICE_TOKEN || '',
        };
    }

    private trimHistoryForAI(history: { role: string; content: string }[]) {
        return history.slice(-4).map((message) => ({
            role: message.role,
            content:
                message.content.length > 1200
                    ? `${message.content.slice(0, 1200).trim()} ...`
                    : message.content,
        }));
    }

    // ==================== CHAT ====================

    async getChats(user: AuthUser) {
        const chats = await this.chatRepository.findChatsByUserId(user.id);
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
                subject: chat.subject
                    ? {
                          id: chat.subject.id,
                          name: chat.subject.name,
                          slug: chat.subject.slug,
                          icon: chat.subject.icon,
                          color: chat.subject.color,
                      }
                    : null,
            })),
            total: chats.length,
        };
    }

    async createChat(user: AuthUser, title?: string, subjectId?: string) {
        let chatTitle = title || '';

        // If no custom title and has subject, use subject name as title
        if (!chatTitle && subjectId) {
            const subject = await this.prisma.subject.findUnique({
                where: { id: subjectId },
                select: { name: true },
            });
            if (subject) {
                chatTitle = subject.name;
            }
        }

        const id = this.generateId();
        const chat = await this.chatRepository.createChat({
            id,
            userId: user.id,
            title: chatTitle,
            subjectId: subjectId || null,
        });

        // Return with subject info if available
        if (subjectId) {
            const subject = await this.prisma.subject.findUnique({
                where: { id: subjectId },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    icon: true,
                    color: true,
                },
            });
            return { ...chat, subject };
        }
        return chat;
    }

    async updateChat(chatId: string, user: AuthUser, title: string) {
        const chat = await this.getChatByIdAndValidateOwner(chatId, user);
        return this.chatRepository.updateChat(chat.id, { title });
    }

    async deleteChat(chatId: string, user: AuthUser) {
        await this.getChatByIdAndValidateOwner(chatId, user);
        await this.chatRepository.deleteChat(chatId);
        return { success: true, message: 'Chat deleted' };
    }

    /** `exists` is true only for the caller's own chat (another user's chat looks missing). */
    async chatExists(chatId: string, user: AuthUser) {
        const exists = await this.chatRepository.chatExists(chatId, user.id);
        return { exists };
    }

    // ==================== MESSAGES ====================

    async getMessages(chatId: string, user: AuthUser) {
        await this.getChatByIdAndValidateOwner(chatId, user);
        return this.chatRepository.findMessagesByChatId(chatId);
    }

    async sendMessage(
        chatId: string,
        user: AuthUser,
        data: {
            message: string;
            imageUrl?: string;
            documentId?: string;
            documentIds?: string[];
            documentName?: string;
        },
        userToken?: string
    ) {
        const chat = await this.getChatByIdAndValidateOwner(chatId, user);

        // Check subscription limits
        await this.checkLimits(user.id, chatId);

        // Caller-supplied document ids must belong to the requesting user
        // before we let them influence AI context resolution
        const requestedDocumentIds = [
            ...(data.documentIds && Array.isArray(data.documentIds)
                ? data.documentIds
                : []),
            ...(data.documentId ? [data.documentId] : []),
        ];
        if (requestedDocumentIds.length > 0) {
            await this.verifyDocumentOwnership(requestedDocumentIds, userToken);
        }

        // Create user message
        const userMessage = await this.chatRepository.createMessage({
            id: this.generateId(),
            chatId: chat.id,
            role: 'user',
            content: data.message,
            imageUrl: data.imageUrl,
            documentId: data.documentId,
            documentName: data.documentName,
        });

        // Get history for context - fetch only the recent messages needed
        // by trimHistoryForAI instead of the entire chat history
        const history = await this.chatRepository.findRecentMessages(
            chatId,
            this.aiHistoryFetchLimit
        );
        const historyForAI = this.trimHistoryForAI(history);

        // Collect all document IDs: from DTO + from chat's linked documents
        let effectiveDocumentIds: string[] = [...requestedDocumentIds];
        // Add documents from chat's AIChatDocument table
        const chatDocIds = await this.chatRepository.getDocumentIds(chatId);
        effectiveDocumentIds.push(...chatDocIds);
        // Deduplicate
        effectiveDocumentIds = [...new Set(effectiveDocumentIds)];

        // Process documents on-demand if they haven't been OCR'd yet
        if (effectiveDocumentIds.length > 0) {
            await this.checkAndProcessDocuments(effectiveDocumentIds, userToken);
        }

        const userStorageId =
            effectiveDocumentIds.length > 0 ? effectiveDocumentIds[0] : null;

        // Call AI service
        let aiResponse = '';
        try {
            const response = await firstValueFrom(
                this.httpService.post(
                    `${this.aiServiceUrl}/chat/query`,
                    {
                        query: data.message,
                        history: historyForAI,
                        user_storage_id: userStorageId,
                    },
                    { headers: this.internalHeaders }
                )
            );
            aiResponse = response.data.answer || 'No response';
        } catch (error) {
            this.logger.error(`Error calling AI service: ${error.message}`);
            aiResponse = 'Xin lỗi, có lỗi xảy ra khi xử lý câu hỏi của bạn.';
        }

        // Create assistant message
        const assistantMessage = await this.chatRepository.createMessage({
            id: this.generateId(),
            chatId: chat.id,
            role: 'assistant',
            content: aiResponse,
        });

        // Update chat title if first message
        let chatTitle = chat.title;
        if (!chat.title && history.length <= 1) {
            chatTitle = data.message.slice(0, 50);
            await this.chatRepository.updateChat(chatId, { title: chatTitle });
        }

        return {
            success: true,
            userMessage,
            assistantMessage,
            chatTitle,
        };
    }

    async streamMessage(
        chatId: string,
        user: AuthUser,
        data: {
            message: string;
            imageUrl?: string;
            documentId?: string;
            documentIds?: string[];
            documentName?: string;
            modelType?: string;
        },
        userToken?: string
    ): Promise<Observable<any>> {
        const chat = await this.getChatByIdAndValidateOwner(chatId, user);

        // Check subscription limits
        await this.checkLimits(user.id, chatId);

        // Caller-supplied document ids must belong to the requesting user
        // before we let them influence AI context resolution
        const requestedDocumentIds = [
            ...(data.documentIds && Array.isArray(data.documentIds)
                ? data.documentIds
                : []),
            ...(data.documentId ? [data.documentId] : []),
        ];
        if (requestedDocumentIds.length > 0) {
            await this.verifyDocumentOwnership(requestedDocumentIds, userToken);
        }

        // Get subject system prompt if chat has a subject
        let systemPrompt: string | null = null;
        if (chat.subjectId) {
            const subject = await this.prisma.subject.findUnique({
                where: { id: chat.subjectId },
                select: { systemPrompt: true },
            });
            if (subject) {
                systemPrompt = subject.systemPrompt;
            }
        }

        // Collect all document IDs: from DTO + from chat's linked documents
        let effectiveDocumentIds: string[] = [...requestedDocumentIds];
        // Add documents from chat's AIChatDocument table
        const chatDocIds = await this.chatRepository.getDocumentIds(chatId);
        effectiveDocumentIds.push(...chatDocIds);
        // Deduplicate
        effectiveDocumentIds = [...new Set(effectiveDocumentIds)];

        // Process documents on-demand if they haven't been OCR'd yet
        if (effectiveDocumentIds.length > 0) {
            this.logger.log(
                `[streamMessage] Processing ${effectiveDocumentIds.length} documents on-demand...`
            );
            await this.checkAndProcessDocuments(effectiveDocumentIds, userToken);
        }

        // 1. Save User Message
        const userMessage = await this.chatRepository.createMessage({
            id: this.generateId(),
            chatId: chat.id,
            role: 'user',
            content: data.message,
            imageUrl: data.imageUrl,
            documentId: data.documentId,
            documentName: data.documentName,
        });

        const subject = new Subject<any>();

        // 2. Prepare History & Payload - fetch only the recent messages
        // needed by trimHistoryForAI instead of the entire chat history
        const history = await this.chatRepository.findRecentMessages(
            chatId,
            this.aiHistoryFetchLimit
        );
        const historyForAI = this.trimHistoryForAI(history);

        const userStorageId =
            effectiveDocumentIds.length > 0 ? effectiveDocumentIds[0] : null;

        const payload = {
            query: data.message,
            history: historyForAI,
            user_storage_id: userStorageId,
            model_type: data.modelType || undefined,
            system_prompt: systemPrompt, // Subject-specific system prompt
        };

        this.logger.log(
            `[streamMessage] Using AI model: ${payload.model_type}`
        );

        // 3. Call AI Service Stream
        this.httpService
            .post(`${this.aiServiceUrl}/chat/stream`, payload, {
                responseType: 'stream',
                headers: this.internalHeaders,
            })
            .subscribe({
                next: (response) => {
                    // Emit user message first
                    subject.next({ type: 'user_message', data: userMessage });

                    const stream = response.data;
                    let buffer = '';
                    let accumulatedAnswer = '';

                    stream.on('data', (chunk: Buffer) => {
                        buffer += chunk.toString();
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            if (line.trim().startsWith('data: ')) {
                                try {
                                    const eventData = line.trim().slice(6);
                                    if (eventData === '[DONE]') continue;

                                    const event = JSON.parse(eventData);
                                    if (event.type === 'chunk') {
                                        accumulatedAnswer += event.data;
                                        subject.next({
                                            type: 'chunk',
                                            data: event.data,
                                        });
                                    } else if (event.type === 'error') {
                                        subject.next({
                                            type: 'error',
                                            data: event.data,
                                        });
                                    }
                                } catch (e) {
                                    // Ignore parse error
                                }
                            }
                        }
                    });

                    stream.on('end', async () => {
                        try {
                            // 4. Save Assistant Message
                            const assistantMessage =
                                await this.chatRepository.createMessage({
                                    id: this.generateId(),
                                    chatId: chat.id,
                                    role: 'assistant',
                                    content: accumulatedAnswer || 'No response',
                                });

                            // 5. Update Title if needed
                            let chatTitle = chat.title;
                            const isNewChat =
                                !chat.title && history.length <= 1;
                            if (isNewChat) {
                                chatTitle = data.message.slice(0, 50);
                                await this.chatRepository.updateChat(chatId, {
                                    title: chatTitle,
                                });
                            }

                            subject.next({
                                type: 'done',
                                data: {
                                    assistantMessage,
                                    isNewChat,
                                },
                            });
                            subject.complete();
                        } catch (err) {
                            subject.error(err);
                        }
                    });

                    stream.on('error', (err) => {
                        this.logger.error('Stream error', err);
                        subject.error(err);
                    });
                },
                error: (err) => {
                    this.logger.error('Http request error', err);
                    subject.error(err);
                },
            });

        return subject.asObservable();
    }

    async updateMessage(messageId: string, user: AuthUser, content: string) {
        const message = await this.chatRepository.findMessageById(messageId);
        if (!message) throw new NotFoundException('Message not found');

        // Validate owner
        await this.getChatByIdAndValidateOwner(message.chatId, user);

        return this.chatRepository.updateMessage(messageId, { content });
    }

    async deleteMessage(messageId: string, user: AuthUser) {
        const message = await this.chatRepository.findMessageById(messageId);
        if (!message) throw new NotFoundException('Message not found');

        await this.getChatByIdAndValidateOwner(message.chatId, user);
        await this.chatRepository.deleteMessage(messageId);

        return { success: true, message: 'Message deleted' };
    }

    async regenerateFromMessage(
        messageId: string,
        user: AuthUser,
        userToken?: string
    ) {
        const message = await this.chatRepository.findMessageById(messageId);
        if (!message) throw new NotFoundException('Message not found');
        if (message.role !== 'user')
            throw new NotFoundException(
                'Can only regenerate from user message'
            );

        const chat = await this.getChatByIdAndValidateOwner(
            message.chatId,
            user
        );

        // Delete messages after this one
        await this.chatRepository.deleteMessagesAfter(
            chat.id,
            message.createdAt
        );

        // Re-send the message
        return this.sendMessage(
            chat.id,
            user,
            {
                message: message.content,
                imageUrl: message.imageUrl || undefined,
                documentId: message.documentId || undefined,
                documentName: message.documentName || undefined,
            },
            userToken
        );
    }

    async regenerateFromMessageStream(
        messageId: string,
        user: AuthUser,
        userToken?: string
    ): Promise<Observable<any>> {
        const message = await this.chatRepository.findMessageById(messageId);
        if (!message) throw new NotFoundException('Message not found');
        if (message.role !== 'user')
            throw new NotFoundException(
                'Can only regenerate from user message'
            );

        const chat = await this.getChatByIdAndValidateOwner(
            message.chatId,
            user
        );

        // Delete messages after this one (including this user message, it will be re-created by streamMessage)
        await this.chatRepository.deleteMessagesAfter(
            chat.id,
            message.createdAt
        );

        // Re-send the message with streaming
        return this.streamMessage(
            chat.id,
            user,
            {
                message: message.content,
                imageUrl: message.imageUrl || undefined,
                documentId: message.documentId || undefined,
                documentName: message.documentName || undefined,
            },
            userToken
        );
    }

    // ==================== DOCUMENTS ====================

    async getDocuments(chatId: string, user: AuthUser) {
        await this.getChatByIdAndValidateOwner(chatId, user);
        return this.chatRepository.findDocumentsByChatId(chatId);
    }

    async addDocument(
        chatId: string,
        user: AuthUser,
        documentId: string,
        documentName: string,
        userToken?: string
    ) {
        await this.getChatByIdAndValidateOwner(chatId, user);
        await this.verifyDocumentOwnership([documentId], userToken);
        return this.chatRepository.addDocument({
            chatId,
            documentId,
            documentName,
        });
    }

    async removeDocument(chatId: string, user: AuthUser, documentId: string) {
        await this.getChatByIdAndValidateOwner(chatId, user);
        await this.chatRepository.removeDocument(chatId, documentId);
        return { success: true };
    }

    // ==================== HELPERS ====================

    private async getChatByIdAndValidateOwner(chatId: string, user: AuthUser) {
        const chat = await this.chatRepository.findChatById(chatId);
        if (!chat || chat.userId !== user.id) {
            throw new NotFoundException('Chat not found');
        }
        return chat;
    }

    private generateId(): string {
        return (
            Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
        );
    }

    /**
     * Verify that every given document id belongs to the requesting user (document-service,
     * `AssertOwnership` with the caller's own token). Throws ForbiddenException if any id does not
     * exist or belongs to another user, preventing cross-user document disclosure (IDOR).
     */
    private async verifyDocumentOwnership(
        documentIds: string[],
        userToken?: string
    ): Promise<void> {
        if (!documentIds.length) return;

        try {
            await this.documents.assertOwnership(
                [...new Set(documentIds)],
                userMetadata(userToken)
            );
        } catch (error) {
            if (isGrpcStatus(error, GrpcStatus.NOT_FOUND)) {
                throw new ForbiddenException(
                    'Bạn không có quyền truy cập một hoặc nhiều tài liệu được yêu cầu'
                );
            }
            throw toDocumentHttpException(error);
        }
    }

    /**
     * Check and process documents on-demand: documents that are PENDING (never processed, e.g. a
     * quick-upload) or FAILED are handed back to document-service (`EnsureProcessed` re-queues the
     * OCR / vectorization in ai-service). Then the chat waits for every attached document to be
     * COMPLETED or FAILED, polling `GetDocumentsByIds` for at most `AI_CHAT_DOCUMENT_WAIT_MS` (default
     * 2 minutes; HEAD waited synchronously up to 5). On timeout the message goes on without that
     * document's context, as it did when HEAD's OCR call failed. Never throws.
     */
    private async checkAndProcessDocuments(
        documentIds: string[],
        userToken?: string
    ): Promise<void> {
        if (!documentIds.length) return;

        const metadata = userMetadata(userToken);
        let docs: documentV1.DocumentInfo[];
        try {
            docs = await this.documents.getDocumentsByIds(documentIds, metadata);
        } catch (error) {
            this.logger.error(
                `[checkAndProcessDocuments] Could not read the documents: ${(error as Error).message}`
            );
            return;
        }

        const pendingDocs = docs.filter(
            (doc) =>
                doc.processingStatus === DocStatus.DOCUMENT_PROCESSING_STATUS_PENDING ||
                doc.processingStatus === DocStatus.DOCUMENT_PROCESSING_STATUS_FAILED
        );
        for (const doc of pendingDocs) {
            try {
                await this.documents.ensureProcessed(doc.id, metadata);
                this.logger.log(
                    `[checkAndProcessDocuments] Queued processing: ${doc.filename}`
                );
            } catch (error) {
                this.logger.error(
                    `[checkAndProcessDocuments] Error processing ${doc.filename}: ${(error as Error).message}`
                );
            }
        }

        // Everything not COMPLETED yet (a PROCESSING one may be seconds from done, a re-queued one is PENDING).
        const toWaitFor = docs
            .filter((doc) => doc.processingStatus !== DocStatus.DOCUMENT_PROCESSING_STATUS_COMPLETED)
            .map((doc) => doc.id);
        if (toWaitFor.length === 0) {
            this.logger.log('[checkAndProcessDocuments] All documents already processed');
            return;
        }
        const names = new Map(docs.map((doc) => [doc.id, doc.filename]));
        const timedOut = await waitForDocuments(toWaitFor, this.documentWaitMs, {
            fetchDocuments: (ids) => this.documents.getDocumentsByIds(ids, metadata),
            sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            now: () => Date.now(),
            onPollError: (error) =>
                this.logger.warn(`[checkAndProcessDocuments] Poll failed: ${(error as Error).message}`),
        });
        if (timedOut.length > 0) {
            this.logger.warn(
                `[checkAndProcessDocuments] Still processing after ${this.documentWaitMs} ms, continuing without context: ${timedOut
                    .map((id) => names.get(id) ?? id)
                    .join(', ')}`
            );
        }
    }

    /**
     * FREE_MODE: Khi bật, bypass tất cả limits
     * Chỉ dùng cho phát triển local — không bao giờ bật trên production
     */
    private async checkLimits(userId: string, chatId: string) {
        // FREE_MODE: Bypass all limits
        const FREE_MODE = false;
        if (FREE_MODE) {
            this.logger.log(`[FREE_MODE] Bypassed limits for user ${userId}`);
            return;
        }

        // Conservative Free-tier defaults used whenever we cannot reliably
        // determine the user's real subscription benefits. Failing open
        // (no limit) would let unauthenticated/misconfigured paths bypass
        // rate limiting entirely, so we fail SAFE instead.
        const freeTierDefaults = {
            tier: 0,
            tierName: 'Free',
            filesPerMonth: 5,
            messagesPerMinute: 5,
            chatMessagesLimit: 30,
        };

        let benefits: subscriptionV1.GetUserBenefitsResponse;
        try {
            benefits = await this.finance.getUserBenefits(
                userId,
                buildMetadata()
            );
        } catch (error) {
            this.logger.error(
                `Error getting subscription benefits: ${error.message}`
            );
            // Fallback to Free defaults
            benefits = freeTierDefaults;
        }

        // Check Rate Limit (Messages per minute)
        if (benefits.messagesPerMinute !== -1) {
            const count =
                await this.chatRepository.countMessagesLastMinute(userId);
            if (count >= benefits.messagesPerMinute) {
                throw new ForbiddenException(
                    `Giới hạn tốc độ: ${benefits.messagesPerMinute} tin nhắn/phút. Vui lòng chờ giây lát.`
                );
            }
        }

        // Check Chat Message Limit (Context Length)
        if (benefits.chatMessagesLimit !== -1) {
            const count =
                await this.chatRepository.countUserMessagesInChat(chatId);
            if (count >= benefits.chatMessagesLimit) {
                throw new ForbiddenException(
                    `Giới hạn hội thoại: ${benefits.chatMessagesLimit} tin nhắn. Vui lòng tạo đoạn chat mới.`
                );
            }
        }
    }

    /**
     * Clears a chat. With `deleteFiles` the chat's documents are deleted in document-service in ONE call
     * (as the caller; it removes the rows, queues the R2 objects and announces `document.deleted`), and
     * the chat is deleted only after that succeeded: if document-service cannot answer the chat is kept
     * and the call is a 503, so a retry deletes both.
     */
    async clearChat(
        chatId: string,
        user: AuthUser,
        deleteFiles: boolean = false,
        userToken?: string
    ) {
        // Validate chat ownership
        await this.getChatByIdAndValidateOwner(chatId, user);

        const deletedFiles: string[] = [];

        if (deleteFiles) {
            const documentIds =
                await this.chatRepository.getDocumentIds(chatId);
            if (documentIds.length > 0) {
                try {
                    const result = await this.documents.deleteDocuments(
                        documentIds,
                        userMetadata(userToken)
                    );
                    for (const file of result.deleted) {
                        deletedFiles.push(file.filename);
                        this.logger.log(
                            `[clearChat] Deleted file: ${file.filename}`
                        );
                    }
                } catch (error) {
                    this.logger.error(
                        `[clearChat] Could not delete the files of chat ${chatId}: ${(error as Error).message}`
                    );
                    if (isGrpcUnavailable(error)) {
                        throw new ServiceUnavailableException({
                            statusCode: 503,
                            code: 'SERVICE_UNAVAILABLE',
                            message:
                                'Không thể xóa file lúc này, chat được giữ lại. Vui lòng thử lại sau.',
                        });
                    }
                    throw toDocumentHttpException(error);
                }
            }
        }

        // Delete the chat (this will cascade delete messages and document links)
        await this.chatRepository.deleteChat(chatId);

        return {
            success: true,
            message: deleteFiles
                ? 'Chat và files đã được xóa'
                : 'Chat đã được xóa',
            deletedFiles: deleteFiles ? deletedFiles : undefined,
        };
    }
}
