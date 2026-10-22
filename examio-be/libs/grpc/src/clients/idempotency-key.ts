import { randomBytes } from 'crypto';

/** RFC 9562 UUIDv7: 48-bit unix-ms timestamp, version 7, variant 10, 74 random bits. */
export function uuidv7(now: number = Date.now()): string {
    const bytes = randomBytes(16);
    bytes.writeUIntBE(now, 0, 6);
    bytes[6] = (bytes[6] & 0x0f) | 0x70;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Per-request debit key `<op>:<uuidv7>`, created ONCE per HTTP request and
 * reused by every retry of that request's debit. (Once-per-file operations use
 * `<op>:<storageId>` instead, so a repeated upload cannot charge twice.)
 */
export const newIdempotencyKey = (op: string): string => `${op}:${uuidv7()}`;
