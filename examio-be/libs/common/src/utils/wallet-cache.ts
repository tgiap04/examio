import { Logger } from '@nestjs/common';
import type { RedisService } from '@examio/redis';
import {
    CACHE_MODULES,
    getUserCacheKey,
    getUserCachePattern,
} from '../constants/cache-keys';

/**
 * Every Redis key a wallet-affecting write can make stale, built from the SAME
 * builders the repositories read with (so a rename of a module key can not
 * silently disable invalidation):
 *  - wallet: `wallet:user:<u>` (+ `:transactions`) and its item / list scopes;
 *  - wallet transactions: stats, usage breakdown and paginated lists of `<walletId>`;
 *  - payments: the user's lists and the cached payment statistics.
 */
export function walletCacheTargets(
    userId: string,
    walletId?: string
): { keys: string[]; patterns: string[] } {
    const walletUser = getUserCacheKey('WALLET', userId);
    const tx = CACHE_MODULES.WALLET_TRANSACTION;
    const keys = [walletUser, `${walletUser}:transactions`];
    const patterns = [
        getUserCachePattern('WALLET', userId),
        getUserCachePattern('PAYMENT', userId),
    ];
    keys.push(`${CACHE_MODULES.PAYMENT}:stats:user:${userId}`);
    if (walletId) {
        keys.push(
            `${tx}:stats:${walletId}`,
            `${tx}:usage_breakdown:${walletId}`
        );
        patterns.push(`${tx}:wallet:${walletId}:page:*`);
    }
    return { keys, patterns };
}

/** Call AFTER the writing transaction has committed. */
export async function invalidateWalletCaches(
    redis: Pick<RedisService, 'del' | 'delPattern'>,
    userId: string,
    walletId?: string
): Promise<void> {
    const { keys, patterns } = walletCacheTargets(userId, walletId);
    await Promise.all([
        ...keys.map((k) => redis.del(k)),
        ...patterns.map((p) => redis.delPattern(p)),
    ]);
}

const logger = new Logger('WalletCache');

/**
 * Post-commit invalidation must never change the outcome of an operation that
 * already committed (a money RPC, a webhook, an admin adjustment): a Redis
 * failure is logged and the stale entries simply expire with their TTL.
 */
export async function invalidateWalletCachesBestEffort(
    redis: Pick<RedisService, 'del' | 'delPattern'>,
    userId: string,
    walletId?: string
): Promise<void> {
    try {
        await invalidateWalletCaches(redis, userId, walletId);
    } catch (err) {
        logger.warn(
            `Wallet cache invalidation failed for user ${userId}; entries expire by TTL: ${err instanceof Error ? err.message : String(err)}`
        );
    }
}
