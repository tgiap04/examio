import { HttpException, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

export const WORD_FAMILY_DAILY_LIMIT = 20;
/** A day plus an hour of slack, so the key outlives its UTC date. */
const COUNTER_TTL_SECONDS = 90_000;

const logger = new Logger('WordFamilyGenerationLimit');

export const dailyGenerationKey = (userId: string, at: Date): string =>
    `wf:gen:daily:${userId}:${at.toISOString().slice(0, 10)}`;

/**
 * Per-user cap on AI word-family generations (free for TEACHERs, so the cap
 * and the gateway rate limit are the only brakes). Counts the attempt, fails
 * closed when Redis is unavailable.
 */
export async function consumeDailyGeneration(
    redis: Pick<Redis, 'multi'>,
    userId: string,
    now: Date = new Date()
): Promise<void> {
    const key = dailyGenerationKey(userId, now);
    let count: number;
    try {
        const results = await redis
            .multi()
            .incr(key)
            .expire(key, COUNTER_TTL_SECONDS, 'NX')
            .exec();
        if (!results || results.some(([e]) => e))
            throw new Error('INCR transaction failed');
        count = Number(results[0][1]);
    } catch (err) {
        logger.warn(
            `Quota check failed: ${err instanceof Error ? err.message : String(err)}`
        );
        throw new HttpException(
            {
                statusCode: 503,
                code: 'GENERATION_LIMIT_UNAVAILABLE',
                message: 'Generation quota check is temporarily unavailable',
            },
            503
        );
    }
    if (count > WORD_FAMILY_DAILY_LIMIT) {
        throw new HttpException(
            {
                statusCode: 429,
                code: 'WORD_FAMILY_DAILY_LIMIT',
                message: `Daily word family generation limit (${WORD_FAMILY_DAILY_LIMIT}) reached`,
            },
            429
        );
    }
}
