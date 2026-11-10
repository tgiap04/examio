import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaService, UserStorage } from '../../prisma';
import { DocumentFinance } from '../../clients/document-finance.service';
import { DOWNLOAD_URL_TTL_SECONDS, DocumentStatus, REQUEUE_AFTER_MS, docChargeKey } from '../../config/document.constants';
import { DocumentChargeService } from './document-charge.service';
import { DocumentQueryService } from './document-query.service';
import { DocumentRepository } from './document.repository';

/** OCR/embedding lifecycle: (re-)queueing a document and applying ai-service's verdict. */
@Injectable()
export class DocumentProcessingService {
    private readonly logger = new Logger(DocumentProcessingService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly repo: DocumentRepository,
        private readonly query: DocumentQueryService,
        private readonly charge: DocumentChargeService,
        private readonly finance: DocumentFinance
    ) {}

    /**
     * Makes sure OCR is requested for an owned document: re-emits `document.uploaded` when it is
     * FAILED (free retry, back to PENDING) or was never queued (quick-upload) or its event is stale.
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

        const downloadUrl = await this.charge.downloadUrl(row);
        const claimed = await this.prisma.$transaction(async (tx) => {
            if (!(await this.repo.claimRequeue(tx, row))) return false;
            await this.charge.recordUploaded(tx, row, downloadUrl);
            return true;
        });
        if (claimed) this.logger.log(`Re-queued document ${id} (was ${row.processingStatus})`);
        return (await this.repo.findRaw(this.prisma, id)) ?? row;
    }

    /** A fresh presigned GET for an owned document (404 when not the caller's). Read-only. */
    async downloadUrlOf(userId: string, id: string): Promise<{ downloadUrl: string; expiresAt: number }> {
        const row = await this.query.getOwned(userId, id);
        const downloadUrl = await this.charge.downloadUrl(row);
        return { downloadUrl, expiresAt: Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000 };
    }

    /** `ai.document.processed`: the row becomes COMPLETED. A row deleted meanwhile is ignored. */
    async markProcessed(tx: Prisma.TransactionClient, storageId: string, pageCount: number): Promise<void> {
        const { count } = await tx.userStorage.updateMany({
            where: {
                id: storageId,
                chargeFailedAt: null,
                processingStatus: {
                    in: [DocumentStatus.PENDING, DocumentStatus.PROCESSING, DocumentStatus.FAILED, DocumentStatus.COMPLETED],
                },
            },
            data: { processingStatus: DocumentStatus.COMPLETED, pageCount },
        });
        if (count === 0) this.logger.warn(`ai.document.processed for unknown/unusable document ${storageId}`);
    }

    /**
     * `ai.document.failed`: FAILED, plus `Refund(doc:<id>)` when the upload credit was charged. The refund
     * is idempotent (finance keeps one refund per debit key) and runs inside the consumer's transaction: a
     * finance outage rolls the event back for the retry tier. Once refunded, `creditCharged` is cleared in
     * the same transaction, so the row never reads as charged again: a free retry (EnsureProcessed) that
     * later completes leaves a refunded document uncharged, and a second failure does not refund twice.
     */
    async markFailed(tx: Prisma.TransactionClient, storageId: string, reason: string): Promise<void> {
        const row = await this.repo.findRaw(tx, storageId);
        if (!row || row.chargeFailedAt !== null || row.processingStatus === DocumentStatus.COMPLETED) return;
        if (row.creditCharged) {
            const refunded = await this.finance.refund(
                row.userId,
                docChargeKey(row.id),
                `Document processing failed: ${row.filename}`
            );
            this.logger.log(`Document ${row.id} failed (${reason}); refund ${refunded ? 'applied' : 'not needed'}`);
        }
        await tx.userStorage.update({
            where: { id: row.id },
            data: { processingStatus: DocumentStatus.FAILED, creditCharged: false },
        });
    }
}
