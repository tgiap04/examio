import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaService, UserStorage } from '../../prisma';
import { DOWNLOAD_URL_TTL_SECONDS, DocumentStatus, REQUEUE_AFTER_MS } from '../../config/document.constants';
import { DocumentQueryService } from './document-query.service';
import { DocumentQueueService } from './document-queue.service';
import { DocumentRepository } from './document.repository';

/** OCR/embedding lifecycle: (re-)queueing a document and applying ai-service's verdict. */
@Injectable()
export class DocumentProcessingService {
    private readonly logger = new Logger(DocumentProcessingService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly repo: DocumentRepository,
        private readonly query: DocumentQueryService,
        private readonly queue: DocumentQueueService
    ) {}

    /**
     * Makes sure OCR is requested for an owned document: re-emits `document.uploaded` when it is
     * FAILED (retry, back to PENDING) or was never queued (quick-upload) or its event is stale.
     * PROCESSING and COMPLETED rows, and PENDING rows queued recently, are returned unchanged.
     */
    async ensureProcessed(userId: string, id: string): Promise<UserStorage> {
        const row = await this.query.getOwned(userId, id);
        const stale = Date.now() - REQUEUE_AFTER_MS;
        const needs =
            row.processingStatus === DocumentStatus.FAILED ||
            (row.processingStatus === DocumentStatus.PENDING &&
                (row.queuedAt === null || row.queuedAt.getTime() < stale));
        if (!needs) return row;

        const downloadUrl = await this.queue.downloadUrl(row);
        const claimed = await this.prisma.$transaction(async (tx) => {
            if (!(await this.repo.claimRequeue(tx, row))) return false;
            await this.queue.recordUploaded(tx, row, downloadUrl);
            return true;
        });
        if (claimed) this.logger.log(`Re-queued document ${id} (was ${row.processingStatus})`);
        return (await this.repo.findRaw(this.prisma, id)) ?? row;
    }

    /** A fresh presigned GET for an owned document (404 when not the caller's). Read-only. */
    async downloadUrlOf(userId: string, id: string): Promise<{ downloadUrl: string; expiresAt: number }> {
        const row = await this.query.getOwned(userId, id);
        const downloadUrl = await this.queue.downloadUrl(row);
        return { downloadUrl, expiresAt: Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000 };
    }

    /** `ai.document.processed`: the row becomes COMPLETED. A row deleted meanwhile is ignored. */
    async markProcessed(tx: Prisma.TransactionClient, storageId: string, pageCount: number): Promise<void> {
        const { count } = await tx.userStorage.updateMany({
            where: {
                id: storageId,
                processingStatus: {
                    in: [DocumentStatus.PENDING, DocumentStatus.PROCESSING, DocumentStatus.FAILED, DocumentStatus.COMPLETED],
                },
            },
            data: { processingStatus: DocumentStatus.COMPLETED, pageCount },
        });
        if (count === 0) this.logger.warn(`ai.document.processed for unknown/unusable document ${storageId}`);
    }

    /**
     * `ai.document.failed`: the row becomes FAILED (EnsureProcessed may re-queue it later). A COMPLETED row
     * keeps its result (a late failure of an earlier attempt), and a row deleted meanwhile is ignored.
     */
    async markFailed(tx: Prisma.TransactionClient, storageId: string, reason: string): Promise<void> {
        const { count } = await tx.userStorage.updateMany({
            where: { id: storageId, processingStatus: { not: DocumentStatus.COMPLETED } },
            data: { processingStatus: DocumentStatus.FAILED },
        });
        if (count === 1) this.logger.log(`Document ${storageId} failed (${reason})`);
    }
}
