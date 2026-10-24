import { PENDING_CHARGE_TIMEOUT_MS, REQUEUE_AFTER_MS, docChargeKey, uploadCredits } from './document.constants';

describe('document constants', () => {
    it.each([
        [0, 0],
        [1, 1],
        [2 * 1024 * 1024, 1],
        [2 * 1024 * 1024 + 1, 2],
        [3 * 1024 * 1024, 2],
        [50 * 1024 * 1024, 25],
    ])('%i bytes cost %i credit(s): ceil(sizeMB / 2)', (bytes, credits) => {
        expect(uploadCredits(bytes)).toBe(credits);
    });

    it('the charge key is bound to the storage id', () => {
        expect(docChargeKey('abc')).toBe('doc:abc');
    });

    it('the reaper waits longer than a slow request and a re-queue waits longer than the reaper', () => {
        expect(PENDING_CHARGE_TIMEOUT_MS).toBe(10 * 60 * 1000);
        expect(REQUEUE_AFTER_MS).toBeGreaterThan(PENDING_CHARGE_TIMEOUT_MS);
    });
});
