import {
    Inject,
    Injectable,
    Logger,
    OnModuleInit,
    Provider,
    ServiceUnavailableException,
    Type,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Metadata, status } from '@grpc/grpc-js';
import { PROTO_FILES, authV1 } from '@examio/contracts';
import { invokeRpc } from '../deadline-retry';
import { buildMetadata } from '../metadata';
import { GrpcClientRegistration } from '../grpc-client.module';
import { GRPC_METADATA_ATTACHER, GrpcMetadataAttacher } from './finance.client';
import { ProfileCacheRedis, PublicProfileCache } from './public-profile-cache';
import { PublicUser, toPublicUser } from './public-user';

// Re-exported so this module (and `@examio/grpc`) keeps its public surface.
export { toPublicUser, type PublicUser } from './public-user';
export {
    PROFILE_CACHE_TTL_SECONDS,
    PROFILE_TOMBSTONE_TTL_SECONDS,
    profileCacheKey,
    profileTombstoneKey,
    type ProfileCacheRedis,
} from './public-profile-cache';

export const AUTH_GRPC = 'AUTH_GRPC';

export const AUTH_GRPC_REGISTRATION: GrpcClientRegistration = {
    name: AUTH_GRPC,
    pkg: PROTO_FILES.auth.pkg,
    protoFile: [PROTO_FILES.auth.file, PROTO_FILES.authUsers.file],
    urlEnv: 'AUTH_GRPC_URL',
};

export interface ProfileLookupOptions {
    /**
     * Default false: an unreachable auth degrades to `null` placeholders (fine
     * for display). `true` throws 503 instead, for callers that DECIDE on the
     * answer (e.g. which ids may join a share list).
     */
    strict?: boolean;
}

export const PUBLIC_PROFILE_REDIS = 'PUBLIC_PROFILE_REDIS';
/** Cache key prefix, e.g. `exam:cache:user:`; each service owns its own Redis namespace. */
export const PUBLIC_PROFILE_CACHE_PREFIX = 'PUBLIC_PROFILE_CACHE_PREFIX';

/** auth rejects more than 500 ids in one GetPublicProfilesByIds (INVALID_ARGUMENT). */
export const PROFILE_BATCH_SIZE = 500;
const PROFILE_FETCH_CONCURRENCY = 4;

const AUTH = `${PROTO_FILES.auth.pkg}.${authV1.AUTH_SERVICE_NAME}`;

function isUnavailable(err: unknown): boolean {
    const code = (err as { code?: number } | null)?.code;
    return code === status.UNAVAILABLE || code === status.DEADLINE_EXCEEDED;
}

/**
 * service -> auth public profiles. A consumer owns no user data: names and
 * avatars are fetched in ONE batched call per request, with a Redis cache of
 * the public projection (never email) that the service's `auth.user.updated`
 * consumer invalidates. The cache key prefix is per service.
 */
@Injectable()
export class PublicProfileClient implements OnModuleInit {
    protected readonly logger = new Logger(PublicProfileClient.name);
    private readonly cache: PublicProfileCache;
    private auth!: authV1.AuthServiceClient;

    constructor(
        @Inject(AUTH_GRPC) protected readonly client: ClientGrpc,
        @Inject(PUBLIC_PROFILE_REDIS) redis: ProfileCacheRedis,
        @Inject(GRPC_METADATA_ATTACHER) protected readonly attacher: GrpcMetadataAttacher,
        @Inject(PUBLIC_PROFILE_CACHE_PREFIX) prefix: string
    ) {
        this.cache = new PublicProfileCache(redis, prefix, this.logger);
    }

    onModuleInit(): void {
        this.auth = this.client.getService<authV1.AuthServiceClient>(
            authV1.AUTH_SERVICE_NAME
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
        const cached = await this.cache.read(unique);
        unique.forEach((id, i) => {
            const hit = cached[i];
            if (hit) found.set(id, hit);
        });

        const misses = unique.filter((id) => !found.has(id));
        if (misses.length > 0) {
            const fetched = await this.fetch(misses, metadata, options.strict);
            for (const p of fetched) found.set(p.id, p);
            await this.cache.write(fetched);
        }
        return userIds.map((id) => found.get(id) ?? null);
    }

    /** Drops the cached profile, leaving a tombstone against in-flight re-fills. */
    async invalidate(userId: string): Promise<void> {
        await this.cache.invalidate(userId);
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
            const md = await this.attacher.attach(metadata, 'auth');
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
}

export interface PublicProfileProviderOptions {
    /** e.g. `studyroom:cache:user:` */
    cachePrefix: string;
    /** Host class exposing `getClient()` (`RedisService` from `@examio/redis`). */
    redis: Type<ProfileCacheRedis>;
    /** Host class that attaches a service token (`ServiceMetadata` from `@examio/auth-jwt`). */
    attacher: Type<GrpcMetadataAttacher>;
}

/** The three bindings every host of `PublicProfileClient` needs; DRY for the app modules. */
export function publicProfileConfigProviders(opts: PublicProfileProviderOptions): Provider[] {
    return [
        { provide: PUBLIC_PROFILE_CACHE_PREFIX, useValue: opts.cachePrefix },
        { provide: PUBLIC_PROFILE_REDIS, useExisting: opts.redis },
        { provide: GRPC_METADATA_ATTACHER, useExisting: opts.attacher },
    ];
}
