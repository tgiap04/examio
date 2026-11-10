import { Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { PublicUser, toPublicUser } from './public-user';

/** Structural view of `RedisService` from `@examio/redis` (keeps this lib free of it). */
export interface ProfileCacheRedis {
    getClient(): Redis;
}

export const PROFILE_CACHE_TTL_SECONDS = 600;
export const profileCacheKey = (prefix: string, userId: string) => `${prefix}${userId}`;

/**
 * Left by `invalidate` for a short while: a profile fetched BEFORE the
 * invalidation but written AFTER it would otherwise sit stale for the full TTL.
 * Must outlive the slowest in-flight fetch (3s deadline, a few chunks).
 */
export const PROFILE_TOMBSTONE_TTL_SECONDS = 30;
export const profileTombstoneKey = (prefix: string, userId: string) =>
    `${prefix}${userId}:inv`;

/** KEYS[1]=cache key, KEYS[2]=tombstone key, ARGV[1]=json, ARGV[2]=ttl seconds. */
const SET_UNLESS_TOMBSTONED_LUA = `
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return 1`;

function parseCached(raw: string | null): PublicUser | null {
    if (!raw) return null;
    try {
        const v = JSON.parse(raw) as Partial<PublicUser> | null;
        return v && typeof v.id === 'string' && typeof v.username === 'string'
            ? toPublicUser({
                  id: v.id,
                  username: v.username,
                  name: v.name ?? '',
                  avatar: v.avatar ?? '',
              })
            : null;
    } catch {
        return null;
    }
}

/**
 * Redis cache-aside store of public profiles under one service's key prefix.
 * Reads and writes never fail the caller (a broken cache just means a fetch);
 * `invalidate` does, so the event consumer can retry it.
 */
export class PublicProfileCache {
    constructor(
        private readonly redis: ProfileCacheRedis,
        private readonly prefix: string,
        private readonly logger: Logger
    ) {}

    /** Aligned with `ids`; a miss, an unparsable entry or a Redis error is `null`. */
    async read(ids: string[]): Promise<Array<PublicUser | null>> {
        try {
            const raw = await this.redis
                .getClient()
                .mget(...ids.map((id) => profileCacheKey(this.prefix, id)));
            return raw.map(parseCached);
        } catch (err) {
            this.logger.warn(`profile cache read failed: ${(err as Error).message}`);
            return ids.map(() => null);
        }
    }

    /**
     * One pipelined round trip. Each SET is guarded by a Lua script that skips
     * ids with a tombstone (invalidated while their profile was in flight), so
     * the check and the write cannot interleave with a concurrent invalidate.
     */
    async write(profiles: PublicUser[]): Promise<void> {
        if (profiles.length === 0) return;
        try {
            const pipeline = this.redis.getClient().pipeline();
            for (const p of profiles) {
                pipeline.eval(
                    SET_UNLESS_TOMBSTONED_LUA,
                    2,
                    profileCacheKey(this.prefix, p.id),
                    profileTombstoneKey(this.prefix, p.id),
                    JSON.stringify(p),
                    PROFILE_CACHE_TTL_SECONDS
                );
            }
            await pipeline.exec();
        } catch (err) {
            this.logger.warn(`profile cache write failed: ${(err as Error).message}`);
        }
    }

    async invalidate(userId: string): Promise<void> {
        const client = this.redis.getClient();
        // Tombstone first: a concurrent writer must see it before it can re-fill the key.
        await client.set(
            profileTombstoneKey(this.prefix, userId),
            '1',
            'EX',
            PROFILE_TOMBSTONE_TTL_SECONDS
        );
        await client.del(profileCacheKey(this.prefix, userId));
    }
}
