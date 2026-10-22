import { newIdempotencyKey, uuidv7 } from './idempotency-key';

describe('uuidv7', () => {
    it('is a version-7 / variant-10 UUID carrying the timestamp', () => {
        const id = uuidv7(1_760_000_000_000);
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(parseInt(id.replace(/-/g, '').slice(0, 12), 16)).toBe(1_760_000_000_000);
    });

    it('is unique and time-sortable', () => {
        const a = uuidv7(1_000);
        const b = uuidv7(2_000);
        expect(a < b).toBe(true);
        expect(new Set(Array.from({ length: 500 }, () => uuidv7())).size).toBe(500);
    });
});

describe('newIdempotencyKey', () => {
    it('prefixes the operation', () => {
        expect(newIdempotencyKey('regenerate')).toMatch(/^regenerate:[0-9a-f-]{36}$/);
    });
});
