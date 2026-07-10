import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class GenerateIdService {
    generateId(): string {
        const timestamp = ((new Date().getTime() / 1000) | 0).toString(16);
        const oid =
            timestamp +
            'xxxxxxxxxxxxxxxx'
                .replace(/[x]/g, (_) => ((Math.random() * 16) | 0).toString(16))
                .toLowerCase();

        return oid;
    }

    /**
     * Generate a cryptographically secure random token (hex-encoded).
     * Use this for credentials such as session IDs and refresh tokens
     * where predictability would be a security risk — unlike generateId()
     * which uses Math.random() and is only safe for non-secret entity IDs.
     */
    generateSecureToken(bytes = 32): string {
        return crypto.randomBytes(bytes).toString('hex');
    }

    generate6DigitCode(): string {
        return crypto.randomInt(100000, 1000000).toString();
    }
}
