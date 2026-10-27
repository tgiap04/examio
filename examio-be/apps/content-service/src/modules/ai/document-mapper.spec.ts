import { documentV1 } from '@examio/contracts';
import { processingStatusName, toHttpDocument } from './document-mapper';

const Status = documentV1.DocumentProcessingStatus;

describe('document mapper', () => {
    it.each([
        [Status.DOCUMENT_PROCESSING_STATUS_PENDING_CHARGE, 'PENDING_CHARGE'],
        [Status.DOCUMENT_PROCESSING_STATUS_PENDING, 'PENDING'],
        [Status.DOCUMENT_PROCESSING_STATUS_PROCESSING, 'PROCESSING'],
        [Status.DOCUMENT_PROCESSING_STATUS_COMPLETED, 'COMPLETED'],
        [Status.DOCUMENT_PROCESSING_STATUS_FAILED, 'FAILED'],
        [Status.DOCUMENT_PROCESSING_STATUS_UNSPECIFIED, 'PENDING'],
    ])('status %i is %s', (processingStatus, name) => {
        expect(processingStatusName({ processingStatus })).toBe(name);
    });

    it('the HTTP row has the fields the old UserStorage routes returned, with real numbers and dates', () => {
        const http = toHttpDocument({
            id: 'd1', userId: 'u1', filename: 'a.pdf', mimetype: 'application/pdf', size: '2048', keyR2: 'k', url: 'u',
            processingStatus: Status.DOCUMENT_PROCESSING_STATUS_COMPLETED, creditCharged: true, pageCount: 3,
            createdAt: '1700000000000', updatedAt: '1700000001000',
        });
        expect(Object.keys(http).sort()).toEqual(
            ['createdAt', 'creditCharged', 'filename', 'id', 'keyR2', 'mimetype', 'pageCount', 'processingStatus', 'size', 'updatedAt', 'url', 'userId'].sort()
        );
        expect(http).toMatchObject({ size: 2048, processingStatus: 'COMPLETED', creditCharged: true, pageCount: 3 });
        expect(http.createdAt).toEqual(new Date(1700000000000));
    });
});
