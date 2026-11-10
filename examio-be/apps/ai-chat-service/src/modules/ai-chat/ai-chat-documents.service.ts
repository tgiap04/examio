import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Metadata } from '@grpc/grpc-js';
import { documentV1 } from '@examio/contracts';
import type { AuthUser } from '@examio/auth-jwt';
import {
    DocumentClient,
    isGrpcUnavailable,
    toDocumentHttpException as mapDocumentError,
    userMetadata,
} from '@examio/grpc';
import { AIChatRepository } from './ai-chat.repository';
import { ChatAccessService } from './chat-access.service';
import { resolveDocumentWaitMs, waitForDocuments } from './ai-chat-document-wait';

const Status = documentV1.DocumentProcessingStatus;

/** Resolves after `ms`, or at once when `signal` aborts (the timer is cleared either way). */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const finish = (): void => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', finish);
            resolve();
        };
        const timer = setTimeout(finish, ms);
        if (signal?.aborted) return finish();
        signal?.addEventListener('abort', finish, { once: true });
    });
}

/** A missing or foreign document is `DOCUMENT_NOT_FOUND` on the chat routes (the code the web client reads). */
const toDocumentHttpException = (error: unknown) =>
    mapDocumentError(error, { notFound: { code: 'DOCUMENT_NOT_FOUND', message: 'Tài liệu không tồn tại' } });

/**
 * The documents of a chat. Every document-service call is made AS the caller (forwarded user token,
 * owner-scoped there); the chat only stores `documentId` links.
 */
@Injectable()
export class AIChatDocumentsService {
    private readonly logger = new Logger(AIChatDocumentsService.name);
    /** `AI_CHAT_DOCUMENT_WAIT_MS`: how long one message waits for its documents' OCR. */
    private readonly documentWaitMs = resolveDocumentWaitMs(process.env, this.logger);

    constructor(
        private readonly chats: AIChatRepository,
        private readonly documents: DocumentClient,
        private readonly access: ChatAccessService
    ) {}

    /** Links of the chat with their live file names, from ONE document-service call (links to gone documents are dropped). */
    async list(chatId: string, user: AuthUser, userToken: string) {
        await this.access.ownedChat(chatId, user);
        const links = await this.chats.findDocuments(chatId);
        if (links.length === 0) return [];
        try {
            const live = await this.documents.getDocumentsByIds(
                links.map((link) => link.documentId),
                userMetadata(userToken)
            );
            const names = new Map(live.map((doc) => [doc.id, doc.filename]));
            return links
                .filter((link) => names.has(link.documentId))
                .map((link) => ({ documentId: link.documentId, documentName: names.get(link.documentId) || link.documentName }));
        } catch (error) {
            this.logger.warn(`Could not refresh the documents of chat ${chatId}, listing the stored links: ${(error as Error).message}`);
            return links;
        }
    }

    async add(chatId: string, user: AuthUser, documentId: string, documentName: string, userToken: string) {
        await this.access.ownedChat(chatId, user);
        await this.assertOwned([documentId], userToken);
        return this.chats.upsertDocument({ chatId, documentId, documentName });
    }

    async remove(chatId: string, user: AuthUser, documentId: string) {
        await this.access.ownedChat(chatId, user);
        await this.chats.removeDocument(chatId, documentId);
        return { success: true };
    }

    /** 404 when any id is not the caller's (or does not exist): the same answer, no oracle. */
    async assertOwned(documentIds: string[], userToken: string): Promise<void> {
        if (documentIds.length === 0) return;
        try {
            await this.documents.assertOwnership([...new Set(documentIds)], userMetadata(userToken));
        } catch (error) {
            throw toDocumentHttpException(error);
        }
    }

    /** The ids a message works with: the ones it names plus the chat's own links, without repeats. */
    async effectiveIds(chatId: string, requested: string[]): Promise<string[]> {
        return [...new Set([...requested, ...(await this.chats.documentIds(chatId))])];
    }

    /**
     * Documents that are PENDING (never processed) or FAILED are handed back to document-service
     * (`EnsureProcessed` re-queues OCR in ai-service); then the message waits for every attached
     * document to be COMPLETED or FAILED, polling `GetDocumentsByIds` for at most
     * `AI_CHAT_DOCUMENT_WAIT_MS` (default 2 minutes). On timeout it goes on without that document's
     * context. `onWait` fires once, right before a wait starts, so a stream can start its heartbeat.
     * An aborted `signal` (the client left) stops the wait. Never throws.
     */
    async ensureReady(documentIds: string[], userToken: string, onWait?: () => void, signal?: AbortSignal): Promise<void> {
        if (documentIds.length === 0) return;
        const metadata = userMetadata(userToken);
        let docs: documentV1.DocumentInfo[];
        try {
            docs = await this.documents.getDocumentsByIds(documentIds, metadata);
        } catch (error) {
            this.logger.error(`Could not read the documents: ${(error as Error).message}`);
            return;
        }

        await this.requeueUnprocessed(docs, metadata);

        const toWaitFor = docs
            .filter((doc) => doc.processingStatus !== Status.DOCUMENT_PROCESSING_STATUS_COMPLETED)
            .map((doc) => doc.id);
        if (toWaitFor.length === 0 || signal?.aborted) return;

        onWait?.();
        const names = new Map(docs.map((doc) => [doc.id, doc.filename]));
        const timedOut = await waitForDocuments(toWaitFor, this.documentWaitMs, {
            fetchDocuments: (ids) => this.documents.getDocumentsByIds(ids, metadata),
            sleep: (ms) => abortableSleep(ms, signal),
            signal,
            now: () => Date.now(),
            onPollError: (error) => this.logger.warn(`Poll failed: ${(error as Error).message}`),
        });
        if (timedOut.length > 0) {
            this.logger.warn(
                `Still processing after ${this.documentWaitMs} ms, continuing without context: ${timedOut
                    .map((id) => names.get(id) ?? id)
                    .join(', ')}`
            );
        }
    }

    /** Hands PENDING (never processed) and FAILED documents back to document-service, one by one; never throws. */
    private async requeueUnprocessed(docs: documentV1.DocumentInfo[], metadata: Metadata): Promise<void> {
        const unprocessed = docs.filter(
            (doc) =>
                doc.processingStatus === Status.DOCUMENT_PROCESSING_STATUS_PENDING ||
                doc.processingStatus === Status.DOCUMENT_PROCESSING_STATUS_FAILED
        );
        for (const doc of unprocessed) {
            try {
                await this.documents.ensureProcessed(doc.id, metadata);
                this.logger.log(`Queued processing: ${doc.filename}`);
            } catch (error) {
                this.logger.error(`Error processing ${doc.filename}: ${(error as Error).message}`);
            }
        }
    }

    /**
     * Deletes the documents in document-service with ONE call, as the caller (it removes the rows,
     * queues the R2 objects and announces `document.deleted`). Returns the deleted file names.
     * An outage is a 503 and the caller must keep the chat so a retry deletes both.
     */
    async deleteAll(documentIds: string[], userToken: string): Promise<string[]> {
        if (documentIds.length === 0) return [];
        try {
            const result = await this.documents.deleteDocuments(documentIds, userMetadata(userToken));
            return result.deleted.map((file) => file.filename);
        } catch (error) {
            this.logger.error(`Could not delete the files of the chat: ${(error as Error).message}`);
            if (isGrpcUnavailable(error)) {
                throw new ServiceUnavailableException({
                    statusCode: 503,
                    code: 'SERVICE_UNAVAILABLE',
                    message: 'Không thể xóa file lúc này, chat được giữ lại. Vui lòng thử lại sau.',
                });
            }
            throw toDocumentHttpException(error);
        }
    }
}
