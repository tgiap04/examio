import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * RefreshTokenCipherService
 *
 * Encrypts refresh tokens at rest in Postgres using deterministic
 * AES-256-GCM ("seal"/"open"). Deterministic here means the IV is derived
 * from the plaintext itself (HMAC-SHA256(plaintext) truncated to 12 bytes),
 * so the same plaintext always seals to the same ciphertext.
 *
 * That trade-off is what makes equality lookups possible directly in SQL
 * (`where: { refreshToken: seal(incoming) }`) while still being reversible
 * for the handful of flows that must hand a server-generated plaintext
 * token back to a caller that never presented it (grace-window convergence,
 * `sync-refresh-token`). A random-IV scheme would be safer in the general
 * case but cannot support equality lookup without decrypting every row.
 *
 * This is acceptable specifically because refresh tokens are unique,
 * high-entropy random strings (32 bytes via GenerateIdService): the only
 * thing deterministic encryption leaks is "this row's token equals this
 * other already-secret token", which is exactly the information the lookup
 * needs anyway, and never anything about the plaintext's content.
 *
 * Shared via @kmaedu/common (rather than living only in apps/auth-service)
 * so any service that needs to seal an incoming cookie token before querying
 * can do so — libs must not depend on app code.
 */
@Injectable()
export class RefreshTokenCipherService {
    private readonly key: Buffer;

    constructor() {
        const secret = process.env.REFRESH_TOKEN_ENC_KEY;
        if (!secret || secret.length < 32) {
            throw new Error(
                'REFRESH_TOKEN_ENC_KEY is missing or too short (minimum 32 characters required)'
            );
        }
        this.key = crypto.createHash('sha256').update(secret).digest();
    }

    /**
     * Seal a plaintext refresh token for storage at rest.
     * Same plaintext in → same ciphertext out (deterministic IV).
     */
    seal(plaintext: string): string {
        const iv = crypto
            .createHmac('sha256', this.key)
            .update(plaintext)
            .digest()
            .subarray(0, IV_LENGTH);

        const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
        const ciphertext = Buffer.concat([
            cipher.update(plaintext, 'utf8'),
            cipher.final(),
        ]);
        const authTag = cipher.getAuthTag();

        return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
    }

    /**
     * Reverse `seal`, returning the original plaintext refresh token.
     * Throws if `blob` was not produced by `seal` with the same key
     * (auth tag verification failure).
     */
    open(blob: string): string {
        const raw = Buffer.from(blob, 'base64');
        const iv = raw.subarray(0, IV_LENGTH);
        const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
        const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

        const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
        decipher.setAuthTag(authTag);

        const plaintext = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final(),
        ]);

        return plaintext.toString('utf8');
    }
}
