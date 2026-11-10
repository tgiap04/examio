import { documentV1 } from '@examio/contracts';
import type { UserStorage } from '../../prisma';
import { toDocumentInfo, toHttpDocument } from './document-mapper';

const row = (over: Partial<UserStorage> = {}): UserStorage => ({
    id: 'd1',
    userId: 'u1',
    filename: 'a.pdf',
    url: 'https://r2/a.pdf',
    mimetype: 'application/pdf',
    size: 2048,
    keyR2: 'ai-uploads/u1/a.pdf',
    processingStatus: 'COMPLETED',
    queuedAt: null,
    pageCount: 3,
    createdAt: new Date(1_760_000_000_000),
    updatedAt: new Date(1_760_000_100_000),
    ...over,
});

describe('document mapper', () => {
    it.each([
        ['PENDING', documentV1.DocumentProcessingStatus.DOCUMENT_PROCESSING_STATUS_PENDING],
        ['PROCESSING', documentV1.DocumentProcessingStatus.DOCUMENT_PROCESSING_STATUS_PROCESSING],
        ['COMPLETED', documentV1.DocumentProcessingStatus.DOCUMENT_PROCESSING_STATUS_COMPLETED],
        ['FAILED', documentV1.DocumentProcessingStatus.DOCUMENT_PROCESSING_STATUS_FAILED],
        ['SOMETHING_ELSE', documentV1.DocumentProcessingStatus.DOCUMENT_PROCESSING_STATUS_UNSPECIFIED],
        // A row left PENDING_CHARGE (the contract migration fails them) is never sent as the reserved value 1.
        ['PENDING_CHARGE', documentV1.DocumentProcessingStatus.DOCUMENT_PROCESSING_STATUS_UNSPECIFIED],
    ])('maps status %s to the proto enum', (status, expected) => {
        expect(toDocumentInfo(row({ processingStatus: status })).processingStatus).toBe(expected);
    });

    it('DocumentInfo carries int64 as strings and epoch milliseconds, and no charge flag', () => {
        expect(toDocumentInfo(row())).toEqual({
            id: 'd1',
            userId: 'u1',
            filename: 'a.pdf',
            mimetype: 'application/pdf',
            size: '2048',
            keyR2: 'ai-uploads/u1/a.pdf',
            url: 'https://r2/a.pdf',
            processingStatus: documentV1.DocumentProcessingStatus.DOCUMENT_PROCESSING_STATUS_COMPLETED,
            pageCount: 3,
            createdAt: '1760000000000',
            updatedAt: '1760000100000',
        });
    });

    it('the HTTP row keeps the legacy exam fields (minus creditCharged) and hides the internal bookkeeping columns', () => {
        const http = toHttpDocument(row());
        expect(Object.keys(http).sort()).toEqual(
            ['createdAt', 'filename', 'id', 'keyR2', 'mimetype', 'pageCount', 'processingStatus', 'size', 'updatedAt', 'url', 'userId'].sort()
        );
        expect(http).not.toHaveProperty('creditCharged');
        expect(http).not.toHaveProperty('queuedAt');
    });
});
