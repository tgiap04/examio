import {
    Inject,
    Injectable,
    Logger,
    OnModuleInit,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata, status } from '@grpc/grpc-js';
import { PROTO_FILES, authUsersV1, authV1 } from '@examio/contracts';
import {
    GrpcClientRegistration,
    buildMetadata,
    invokeRpc,
} from '@examio/grpc';
import { ServiceMetadata } from '@examio/auth-jwt';
import { RedisService } from '@examio/redis';

export const AUTH_GRPC = 'AUTH_GRPC';

export const AUTH_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: AUTH_GRPC,
    pkg: PROTO_FILES.auth.pkg,
    protoFile: [PROTO_FILES.auth.file, PROTO_FILES.authUsers.file],
    urlEnv: 'AUTH_GRPC_URL',
};

/** Public projection of a user: the only thing exam ever holds about one. */
export interface PublicUser {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
}

export interface ProfileLookupOptions {
    /**
     * Default false: an unreachable auth degrades to `null` placeholders (fine
     * for display). `true` throws 503 instead, for callers that DECIDE on the
     * answer (e.g. which ids may join a share list).
     */
    strict?: boolean;
}

export const PROFILE_CACHE_TTL_SECONDS = 600;
export const profileCacheKey = (userId: string) => `exam:cache:user:${userId}`;

/**
 * Left by `invalidate` for a short while: a profile fetched BEFORE the
 * invalidation but written AFTER it would otherwise sit stale for the full TTL.
 * Must outlive the slowest in-flight fetch (3s deadline, a few chunks).
 */
export const PROFILE_TOMBSTONE_TTL_SECONDS = 30;
/** KEYS[1]=cache key, KEYS[2]=tombstone key, ARGV[1]=json, ARGV[2]=ttl seconds. */
const SET_UNLESS_TOMBSTONED_LUA = `
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return 1`;

export const profileTombstoneKey = (userId: string) => `exam:cache:user:${userId}:inv`;

/** auth rejects more than 500 ids in one GetPublicProfilesByIds (INVALID_ARGUMENT). */
export const PROFILE_BATCH_SIZE = 500;
const PROFILE_FETCH_CONCURRENCY = 4;

const AUTH = `${PROTO_FILES.auth.pkg}.${authV1.AUTH_SERVICE_NAME}`;
const AUTH_USERS = `${PROTO_FILES.authUsers.pkg}.${authUsersV1.AUTH_USER_SERVICE_NAME}`;

/** Explicit pick: nothing outside the public projection is ever cached or returned. */
function toPublicUser(p: authV1.PublicProfile): PublicUser {
    return {
        id: p.id,
        username: p.username,
        name: p.name || null,
        avatar: p.avatar || null,
    };
}

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

function isUnavailable(err: unknown): boolean {
    const code = (err as { code?: number } | null)?.code;
    return code === status.UNAVAILABLE || code === status.DEADLINE_EXCEEDED;
}

/**
 * exam -> auth. exam owns no user data: names and avatars are fetched here in
 * ONE batched call per request, with a Redis cache of the public projection
 * (never email) that the `auth.user.updated` consumer invalidates.
 */
@Injectable()
export class AuthClient implements OnModuleInit {
    private readonly logger = new Logger(AuthClient.name);
    private auth!: authV1.AuthServiceClient;
    private users!: authUsersV1.AuthUserServiceClient;

    constructor(
        @Inject(AUTH_GRPC) private readonly client: ClientGrpc,
        private readonly redis: RedisService,
        private readonly serviceMetadata: ServiceMetadata
    ) {}

    onModuleInit(): void {
        this.auth = this.client.getService<authV1.AuthServiceClient>(
            authV1.AUTH_SERVICE_NAME
        );
        this.users = this.client.getService<authUsersV1.AuthUserServiceClient>(
            authUsersV1.AUTH_USER_SERVICE_NAME
        );
    }

    /**
     * Profiles aligned with `userIds` (duplicates answered in place). An id
     * auth does not know, a blank id, or (unless `strict`) an unreachable auth
     * yields `null`: display data must never fail the request that asked for it.
     */
    async getPublicProfiles(
        userIds: string[],
        metadata: Metadata = buildMetadata(),
        options: ProfileLookupOptions = {}
    ): Promise<Array<PublicUser | null>> {
        const unique = [...new Set(userIds.filter((id) => !!id))];
        if (unique.length === 0) return userIds.map(() => null);

        const found = new Map<string, PublicUser>();
        const cached = await this.readCache(unique);
        unique.forEach((id, i) => {
            const hit = cached[i];
            if (hit) found.set(id, hit);
        });

        const misses = unique.filter((id) => !found.has(id));
        if (misses.length > 0) {
            const fetched = await this.fetch(misses, metadata, options.strict);
            for (const p of fetched) found.set(p.id, p);
            await this.writeCache(fetched);
        }
        return userIds.map((id) => found.get(id) ?? null);
    }

    /** Display-safe search (no email); server caps at 20. */
    async searchUsers(
        query: string,
        limit: number,
        metadata: Metadata
    ): Promise<PublicUser[]> {
        const md = await this.serviceMetadata.attach(metadata, 'auth');
        const res = await invokeRpc(`${AUTH_USERS}/SearchUsers`, (o) =>
            this.users.searchUsers({ query, limit }, md, o)
        );
        return res.profiles.map(toPublicUser);
    }

    async invalidate(userId: string): Promise<void> {
        const client = this.redis.getClient();
        // Tombstone first: a concurrent writer must see it before it can re-fill the key.
        await client.set(profileTombstoneKey(userId), '1', 'EX', PROFILE_TOMBSTONE_TTL_SECONDS);
        await client.del(profileCacheKey(userId));
    }

    /**
     * Misses in chunks of `PROFILE_BATCH_SIZE` (auth's per-call cap), at most
     * `PROFILE_FETCH_CONCURRENCY` in flight. <= 500 ids is still ONE rpc.
     */
    private async fetch(
        ids: string[],
        metadata: Metadata,
        strict = false
    ): Promise<PublicUser[]> {
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += PROFILE_BATCH_SIZE) {
            chunks.push(ids.slice(i, i + PROFILE_BATCH_SIZE));
        }
        const results: PublicUser[][] = new Array(chunks.length);
        let next = 0;
        const worker = async (): Promise<void> => {
            while (next < chunks.length) {
                const i = next++;
                try {
                    results[i] = await this.fetchChunk(chunks[i], metadata, strict);
                } catch (err) {
                    next = chunks.length; // stop handing out chunks once one failed hard
                    throw err;
                }
            }
        };
        await Promise.all(
            Array.from({ length: Math.min(PROFILE_FETCH_CONCURRENCY, chunks.length) }, worker)
        );
        return results.flat();
    }

    private async fetchChunk(
        ids: string[],
        metadata: Metadata,
        strict: boolean
    ): Promise<PublicUser[]> {
        try {
            const md = await this.serviceMetadata.attach(metadata, 'auth');
            const res = await invokeRpc(`${AUTH}/GetPublicProfilesByIds`, (o) =>
                this.auth.getPublicProfilesByIds({ userIds: ids }, md, o)
            );
            return res.profiles.map(toPublicUser);
        } catch (err) {
            if (!isUnavailable(err)) throw err;
            if (strict) {
                throw new ServiceUnavailableException({
                    statusCode: 503,
                    code: 'SERVICE_UNAVAILABLE',
                    message: 'User directory is temporarily unavailable',
                });
            }
            this.logger.warn(
                `auth unavailable, ${ids.length} profile(s) degraded to null: ${(err as Error).message}`
            );
            return [];
        }
    }

    private async readCache(ids: string[]): Promise<Array<PublicUser | null>> {
        try {
            const raw = await this.redis
                .getClient()
                .mget(...ids.map(profileCacheKey));
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
    private async writeCache(profiles: PublicUser[]): Promise<void> {
        if (profiles.length === 0) return;
        try {
            const pipeline = this.redis.getClient().pipeline();
            for (const p of profiles) {
                pipeline.eval(
                    SET_UNLESS_TOMBSTONED_LUA,
                    2,
                    profileCacheKey(p.id),
                    profileTombstoneKey(p.id),
                    JSON.stringify(p),
                    PROFILE_CACHE_TTL_SECONDS
                );
            }
            await pipeline.exec();
        } catch (err) {
            this.logger.warn(`profile cache write failed: ${(err as Error).message}`);
        }
    }
}
