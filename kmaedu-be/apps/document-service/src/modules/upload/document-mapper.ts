import { documentV1 } from '@kmaedu/contracts';
import { UserStorage } from '../../prisma';
import { DocumentStatus } from '../../config/document.constants';

const STATUS_TO_PROTO: Record<string, documentV1.DocumentProcessingStatus> = {
    [DocumentStatus.PENDING]: documentV1.DocumentProcessingStatus.DOCUMENT_PROCESSING_STATUS_PENDING,
    [DocumentStatus.PROCESSING]: documentV1.DocumentProcessingStatus.DOCUMENT_PROCESSING_STATUS_PROCESSING,
    [DocumentStatus.COMPLETED]: documentV1.DocumentProcessingStatus.DOCUMENT_PROCESSING_STATUS_COMPLETED,
    [DocumentStatus.FAILED]: documentV1.DocumentProcessingStatus.DOCUMENT_PROCESSING_STATUS_FAILED,
};

export function toDocumentInfo(row: UserStorage): documentV1.DocumentInfo {
    return {
        id: row.id,
        userId: row.userId,
        filename: row.filename,
        mimetype: row.mimetype,
        size: String(row.size),
        keyR2: row.keyR2,
        url: row.url,
        processingStatus:
            STATUS_TO_PROTO[row.processingStatus] ??
            documentV1.DocumentProcessingStatus.DOCUMENT_PROCESSING_STATUS_UNSPECIFIED,
        pageCount: row.pageCount,
        createdAt: String(row.createdAt.getTime()),
        updatedAt: String(row.updatedAt.getTime()),
    };
}

/** The `UserStorage` row as the legacy exam routes returned it (no internal bookkeeping columns). */
export function toHttpDocument(row: UserStorage) {
    return {
        id: row.id,
        userId: row.userId,
        filename: row.filename,
        url: row.url,
        mimetype: row.mimetype,
        size: row.size,
        keyR2: row.keyR2,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        processingStatus: row.processingStatus,
        pageCount: row.pageCount,
    };
}
