import { documentV1 } from '@examio/contracts';

const Status = documentV1.DocumentProcessingStatus;

const STATUS_NAME: Partial<Record<documentV1.DocumentProcessingStatus, string>> = {
    [Status.DOCUMENT_PROCESSING_STATUS_PENDING_CHARGE]: 'PENDING_CHARGE',
    [Status.DOCUMENT_PROCESSING_STATUS_PENDING]: 'PENDING',
    [Status.DOCUMENT_PROCESSING_STATUS_PROCESSING]: 'PROCESSING',
    [Status.DOCUMENT_PROCESSING_STATUS_COMPLETED]: 'COMPLETED',
    [Status.DOCUMENT_PROCESSING_STATUS_FAILED]: 'FAILED',
};

/** The `UserStorage.processingStatus` string the HTTP API has always exposed. */
export const processingStatusName = (info: Pick<documentV1.DocumentInfo, 'processingStatus'>): string =>
    STATUS_NAME[info.processingStatus] ?? 'PENDING';

const toDate = (epochMillis: string): Date => new Date(Number(epochMillis));

/** A document as the old exam `UserStorage` routes returned it. */
export function toHttpDocument(info: documentV1.DocumentInfo) {
    return {
        id: info.id,
        userId: info.userId,
        filename: info.filename,
        url: info.url,
        mimetype: info.mimetype,
        size: Number(info.size),
        keyR2: info.keyR2,
        createdAt: toDate(info.createdAt),
        updatedAt: toDate(info.updatedAt),
        processingStatus: processingStatusName(info),
        creditCharged: info.creditCharged,
        pageCount: info.pageCount,
    };
}
