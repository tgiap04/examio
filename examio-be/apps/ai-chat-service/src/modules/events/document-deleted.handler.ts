import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { Envelope, EventHandler, PermanentEventError } from '@examio/messaging';
import type { Prisma } from '../../prisma';
import { AIChatRepository } from '../ai-chat/ai-chat.repository';

export const DOCUMENT_DELETED = 'document.deleted';

/** `examio.events.v1.DocumentDeleted` (JSON uses the camelCase field names). */
const payload = z.object({ storageIds: z.array(z.string()).default([]), userId: z.string().min(1) });

/**
 * The documents are gone: the chat links that pointed at them go with them. Runs in the consumer's
 * idempotency tx and is idempotent by itself (a deleted chat, an id with no link and a replay all
 * delete nothing).
 */
@Injectable()
export class DocumentDeletedHandler {
    private readonly logger = new Logger(DocumentDeletedHandler.name);

    constructor(private readonly chats: AIChatRepository) {}

    @EventHandler(DOCUMENT_DELETED)
    async onDocumentDeleted(envelope: Envelope, tx: Prisma.TransactionClient): Promise<void> {
        const parsed = payload.safeParse(envelope.data);
        if (!parsed.success) {
            throw new PermanentEventError('INVALID_DATA', `${DOCUMENT_DELETED} payload is invalid`);
        }
        const { storageIds } = parsed.data;
        if (storageIds.length === 0) return;
        const removed = await this.chats.deleteLinksOfDocuments(tx, storageIds);
        this.logger.log(`document.deleted: ${removed} chat link(s) of ${storageIds.length} document(s) removed`);
    }
}
