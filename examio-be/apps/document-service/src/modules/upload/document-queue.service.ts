import { Injectable, Logger } from '@nestjs/common';
import { OutboxService } from '@examio/messaging';
import { Prisma, UserStorage } from '../../prisma';
import { R2Client } from '../../clients/r2.client';
import { DOWNLOAD_URL_TTL_SECONDS } from '../../config/document.constants';
import { DocumentErrorCode, documentError } from './document-errors';

/**
 * Hands a document to ai-service: the presigned GET it downloads the file from, and the
 * `document.uploaded` outbox row written in the caller's transaction (the one that makes the row
 * PENDING), so a row is never queued without its event.
 */
@Injectable()
export class DocumentQueueService {
    private readonly logger = new Logger(DocumentQueueService.name);

    constructor(
        private readonly r2: R2Client,
        private readonly outbox: OutboxService
    ) {}

    /** Presigned GET handed to ai-service (valid 1 h); throws 503 when r2 cannot sign. */
    async downloadUrl(doc: Pick<UserStorage, 'keyR2'>): Promise<string> {
        try {
            return await this.r2.createPresignedDownload(doc.keyR2, DOWNLOAD_URL_TTL_SECONDS);
        } catch (error) {
            this.logger.error(`Presigned download failed: ${(error as Error).message}`);
            throw documentError(503, DocumentErrorCode.STORAGE_UNAVAILABLE, 'Không thể truy cập kho lưu trữ lúc này.');
        }
    }

    /** `document.uploaded` in the caller's transaction (the caller stamps `queuedAt` in the same tx). */
    async recordUploaded(tx: Prisma.TransactionClient, doc: UserStorage, downloadUrl: string): Promise<void> {
        await this.outbox.add(tx, 'document.uploaded', {
            storageId: doc.id,
            userId: doc.userId,
            filename: doc.filename,
            mimetype: doc.mimetype,
            downloadUrl,
        });
    }
}
