import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { BadRequestException, HttpException, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

export const CODE_FAIL_LIMIT = 5;
export const CODE_FAIL_WINDOW_SECONDS = 900;
const ACCESS_CODE_PATTERN = /^\d{6}$/;

const logger = new Logger('AccessCodeGuard');

/** The one place a new 6-digit invite code is made (CSPRNG, zero-padded, so 000000-999999 are all possible). */
export const generateAccessCode = (): string =>
    randomInt(0, 1_000_000).toString().padStart(6, '0');

/** Failure counter key: per resource AND per user, so an attacker only locks themselves. */
export const codeFailKey = (resourceId: string, userId: string): string =>
    `exam:codefail:${resourceId}:${userId}`;

export interface VerifyAccessCodeInput {
    resourceId: string;
    userId: string;
    /** The resource's stored 6-digit code (null/empty = no code set). */
    stored: string | null | undefined;
    /** Whatever the client sent; validated here as well as in the DTO. */
    given: unknown;
}

type CodeRedis = Pick<Redis, 'del' | 'multi'>;

const sha256 = (value: string): Buffer =>
    createHash('sha256').update(value, 'utf8').digest();

function error(
    status: number,
    code: string,
    message: string,
    extra: object = {}
): HttpException {
    return new HttpException(
        { statusCode: status, code, message, ...extra },
        status
    );
}

const locked = (retryAfterSeconds: number): HttpException =>
    error(429, 'CODE_LOCKED', 'Too many wrong codes, try again later', {
        retryAfterSeconds: Math.max(retryAfterSeconds, 1),
    });

const unavailable = (cause: unknown): HttpException => {
    logger.warn(
        `Code check unavailable: ${cause instanceof Error ? cause.message : String(cause)}`
    );
    return error(
        503,
        'CODE_CHECK_UNAVAILABLE',
        'Code check is temporarily unavailable'
    );
};

/**
 * The single place an access code is compared (flashcard sets, exam sessions,
 * exam attempts, and the quiz `unlock` later). Fail-closed and race-free:
 * 1. a malformed code is a 400 and is NOT counted;
 * 2. EVERY evaluated attempt first does an atomic INCR (EXPIRE on the first),
 *    so parallel guesses each get a distinct count; above `CODE_FAIL_LIMIT`
 *    the call is refused with 429 BEFORE comparing (a correct code too), which
 *    caps the guesses that are ever evaluated at the limit per window;
 * 3. the comparison is `timingSafeEqual` over sha256 digests (fixed length);
 * 4. success clears the counter; a wrong code at the limit answers 429, below it
 *    400; any Redis error is a 503.
 */
export async function verifyAccessCodeOrThrow(
    redis: CodeRedis,
    { resourceId, userId, stored, given }: VerifyAccessCodeInput
): Promise<void> {
    if (typeof given !== 'string' || !ACCESS_CODE_PATTERN.test(given)) {
        throw new BadRequestException({
            statusCode: 400,
            code: 'INVALID_CODE_FORMAT',
            message: 'Access code must be 6 digits',
        });
    }

    const key = codeFailKey(resourceId, userId);
    let count: number;
    let ttl: number;
    try {
        const results = await redis
            .multi()
            .incr(key)
            .expire(key, CODE_FAIL_WINDOW_SECONDS, 'NX')
            .ttl(key)
            .exec();
        if (!results || results.some(([e]) => e))
            throw new Error('INCR transaction failed');
        count = Number(results[0][1]);
        ttl = Number(results[2][1]);
    } catch (err) {
        throw unavailable(err);
    }
    if (count > CODE_FAIL_LIMIT) throw locked(ttl);

    if (stored && timingSafeEqual(sha256(stored), sha256(given))) {
        try {
            await redis.del(key);
        } catch (err) {
            // The code was right; a stale counter only expires on its own.
            logger.warn(
                `Could not clear ${key}: ${err instanceof Error ? err.message : String(err)}`
            );
        }
        return;
    }

    if (count >= CODE_FAIL_LIMIT) throw locked(ttl);
    throw error(400, 'INVALID_CODE', 'Access code is incorrect');
}
