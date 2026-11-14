import * as crypto from 'crypto';

/**
 * Generate a cryptographically secure numeric code.
 * Uses crypto.randomInt() instead of Math.random() to prevent prediction attacks.
 */
export function generateCode(length: number): string {
    const max = Math.pow(10, length);
    const code = crypto.randomInt(0, max);
    return code.toString().padStart(length, '0');
}
