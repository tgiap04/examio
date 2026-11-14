import { DOWNLOAD_URL_TTL_SECONDS, DocumentStatus, REQUEUE_AFTER_MS } from './document.constants';

describe('document constants', () => {
    it('knows only the four processing states (no PENDING_CHARGE: uploads are not charged)', () => {
        expect(Object.values(DocumentStatus).sort()).toEqual(['COMPLETED', 'FAILED', 'PENDING', 'PROCESSING']);
    });

    it('a PENDING row may be re-queued after 15 minutes; a download URL lives 1 hour', () => {
        expect(REQUEUE_AFTER_MS).toBe(15 * 60 * 1000);
        expect(DOWNLOAD_URL_TTL_SECONDS).toBe(3600);
    });
});
