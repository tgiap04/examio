import { Injectable } from '@nestjs/common';
import { RedisService, EXPIRED_TIME } from '@examio/redis';
import {
    PaginationParams,
    PaginationResult,
} from '../interfaces/pagination.interface';
import {
    CacheModule,
    CACHE_MODULES,
    getUserCacheKey,
    getItemCacheKey,
    getUserCachePattern,
    getItemCachePattern,
    getListCachePattern,
    getPublicCacheKey,
    getPublicCachePattern,
} from '../constants/cache-keys';

/**
 * Structural slice of a service's own Prisma client. Each service generates its
 * client from its own schema, so this lib cannot import one: it only needs
 * `$transaction` here, and reaches model delegates by name (see `model`).
 */
export interface PrismaLike {
    // `tx` is the service-specific transaction client, unknowable in this lib.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction<R>(fn: (tx: any) => Promise<R>): Promise<R>;
}

@Injectable()
export abstract class BaseRepository<T> {
    protected abstract modelName: string;
    protected abstract cachePrefix: string; // Prefix cho Redis keys (should match CACHE_MODULES key)
    protected defaultCacheTTL: EXPIRED_TIME = EXPIRED_TIME.FIVE_MINUTES;
    /** Prepended to EVERY Redis key and pattern this repository builds (`'content:'`); empty = no namespace. */
    protected readonly keyNamespace: string = '';

    constructor(
        protected readonly prisma: PrismaLike,
        protected readonly redis: RedisService
    ) {}

    protected get model() {
        return (this.prisma as any)[this.modelName];
    }

    /** The model delegate of `tx` (a transaction client) when given, else of the service client. */
    protected modelOf(tx?: any) {
        return tx ? tx[this.modelName] : this.model;
    }

    /**
     * Get cache module key from prefix
     */
    protected get cacheModule(): CacheModule {
        const moduleKey = Object.keys(CACHE_MODULES).find(
            (key) =>
                CACHE_MODULES[key as CacheModule].toLowerCase() ===
                this.cachePrefix.toLowerCase()
        );
        return (moduleKey as CacheModule) || 'USER';
    }

    private ns(key: string): string {
        return this.keyNamespace + key;
    }

    /**
     * Generate cache key (legacy - for backward compatibility)
     * @deprecated Use getUserScopedCacheKey or getItemScopedCacheKey instead
     */
    protected getCacheKey(suffix: string): string {
        return this.ns(`${this.cachePrefix}:${suffix}`);
    }

    /**
     * Generate user-scoped cache key
     * Pattern: {module}:user:{userId}
     */
    protected getUserScopedCacheKey(userId: string): string {
        return this.ns(getUserCacheKey(this.cacheModule, userId));
    }

    /**
     * Generate item-scoped cache key (tied to a user)
     * Pattern: {module}:user:{userId}:item:{itemId}:{suffix?}
     */
    protected getItemScopedCacheKey(
        userId: string,
        itemId: string,
        suffix?: string
    ): string {
        return this.ns(getItemCacheKey(this.cacheModule, userId, itemId, suffix));
    }

    /**
     * Generate public cache key (not user-scoped)
     * Pattern: {module}:public:{itemId}:{suffix?}
     */
    protected getPublicScopedCacheKey(itemId: string, suffix?: string): string {
        return this.ns(getPublicCacheKey(this.cacheModule, itemId, suffix));
    }

    /**
     * Invalidate cache by pattern (legacy - invalidates all)
     * @deprecated Use invalidateUserCache or invalidateItemCache instead
     */
    public async invalidateCache(pattern?: string): Promise<void> {
        const key = pattern
            ? this.getCacheKey(pattern)
            : this.ns(`${this.cachePrefix}:*`);

        console.log(`[BaseRepository] Invalidating cache with key: ${key}`);

        // Nếu có wildcard, dùng delPattern, ngược lại dùng del
        if (key.includes('*')) {
            await this.redis.delPattern(key);
        } else {
            await this.redis.del(key);
        }
    }

    /**
     * Invalidate all cache for a specific user in this module
     * Pattern: {module}:user:{userId}:*
     */
    public async invalidateUserCache(userId: string): Promise<void> {
        const pattern = this.ns(getUserCachePattern(this.cacheModule, userId));
        console.log(
            `[BaseRepository] Invalidating user cache with pattern: ${pattern}`
        );
        await this.redis.delPattern(pattern);
    }

    /**
     * Invalidate cache for a specific item owned by user
     * Pattern: {module}:user:{userId}:item:{itemId}:*
     */
    public async invalidateItemCache(
        userId: string,
        itemId: string
    ): Promise<void> {
        const pattern = this.ns(
            getItemCachePattern(this.cacheModule, userId, itemId)
        );
        console.log(
            `[BaseRepository] Invalidating item cache with pattern: ${pattern}`
        );
        await this.redis.delPattern(pattern);
        // Also delete the direct item key
        await this.redis.del(this.getItemScopedCacheKey(userId, itemId));
        // `{id}`-only lookups are cached in the public item scope
        await this.invalidateOneCache(undefined, itemId);
    }

    /**
     * Invalidate list cache for a specific user
     * Pattern: {module}:user:{userId}:list:*
     */
    public async invalidateUserListCache(userId: string): Promise<void> {
        const pattern = this.ns(getListCachePattern(this.cacheModule, userId));
        console.log(
            `[BaseRepository] Invalidating user list cache with pattern: ${pattern}`
        );
        await this.redis.delPattern(pattern);
    }

    /**
     * Invalidate public cache for this module
     * Pattern: {module}:public:*
     */
    public async invalidatePublicCache(): Promise<void> {
        const pattern = this.ns(getPublicCachePattern(this.cacheModule));
        console.log(
            `[BaseRepository] Invalidating public cache with pattern: ${pattern}`
        );
        await this.redis.delPattern(pattern);
    }

    /**
     * Tìm tất cả bản ghi với cache
     */
    async findAll(params?: {
        where?: any;
        include?: any;
        select?: any;
        orderBy?: any;
        take?: number;
        skip?: number;
        cache?: boolean;
        cacheTTL?: EXPIRED_TIME;
    }): Promise<T[]> {
        const {
            cache = false,
            cacheTTL = this.defaultCacheTTL,
            ...queryParams
        } = params || {};

        if (cache) {
            const cacheKey = this.getCacheKey(
                `all:${JSON.stringify(queryParams)}`
            );
            console.log(`[${this.modelName}] 🔍 GET cache key: ${cacheKey}`);
            const cached = await this.redis.get<T[]>(cacheKey);
            if (cached) {
                console.log(`[${this.modelName}] ✅ CACHE HIT: ${cacheKey}`);
                return cached;
            }

            console.log(`[${this.modelName}] ❌ CACHE MISS: ${cacheKey}`);
            const data = await this.model.findMany(queryParams);
            await this.redis.set(cacheKey, data, cacheTTL);
            console.log(`[${this.modelName}] 💾 SET cache key: ${cacheKey}`);
            return data;
        }

        return this.model.findMany(queryParams);
    }


    /**
     * Key of a cached `findOne`. It lives under the scope the writes invalidate:
     * `{id, owner}` -> the owner's item scope, `{id}` -> the public item scope,
     * `{owner}` -> the owner's `one` scope. The old flat key was never matched by
     * any invalidation, so a write stayed invisible for the whole TTL.
     */
    private oneCacheKey(where: any, hash: string): string {
        const id = typeof where?.id === 'string' ? where.id : undefined;
        const owner =
            typeof where?.userId === 'string'
                ? where.userId
                : typeof where?.hostId === 'string'
                  ? where.hostId
                  : undefined;
        if (id && owner) {
            return this.getItemScopedCacheKey(owner, id, `one:${hash}`);
        }
        if (id) {
            return this.getPublicScopedCacheKey(id, `one:${hash}`);
        }
        if (owner) {
            return `${this.getUserScopedCacheKey(owner)}:one:${hash}`;
        }
        return this.getCacheKey(`one:${hash}`);
    }

    /** Drops every cached `findOne` a write can have made stale. */
    protected async invalidateOneCache(
        userId?: string,
        id?: string | number
    ): Promise<void> {
        if (userId) {
            await this.redis.delPattern(
                `${this.getUserScopedCacheKey(userId)}:one:*`
            );
        }
        if (id !== undefined) {
            await this.redis.delPattern(
                `${this.getPublicScopedCacheKey(String(id))}:*`
            );
        }
    }

    /**
     * Tìm một bản ghi theo điều kiện với cache
     */
    async findOne(params: {
        where: any;
        include?: any;
        select?: any;
        cache?: boolean;
        cacheTTL?: EXPIRED_TIME;
    }): Promise<T | null> {
        const {
            cache = false,
            cacheTTL = this.defaultCacheTTL,
            ...queryParams
        } = params;

        if (cache) {
            const cacheKey = this.oneCacheKey(
                queryParams.where,
                JSON.stringify(queryParams)
            );
            console.log(`[${this.modelName}] 🔍 GET cache key: ${cacheKey}`);
            const cached = await this.redis.get<T>(cacheKey);
            if (cached) {
                console.log(`[${this.modelName}] ✅ CACHE HIT: ${cacheKey}`);
                return cached;
            }

            console.log(`[${this.modelName}] ❌ CACHE MISS: ${cacheKey}`);
            const data = await this.model.findFirst(queryParams);
            if (data) {
                await this.redis.set(cacheKey, data, cacheTTL);
                console.log(
                    `[${this.modelName}] 💾 SET cache key: ${cacheKey}`
                );
            }
            return data;
        }

        return this.model.findFirst(queryParams);
    }

    /**
     * Tìm bản ghi theo ID với cache
     */
    async findById(
        id: string | number,
        include?: any,
        cache = true,
        cacheTTL = this.defaultCacheTTL
    ): Promise<T | null> {
        if (cache) {
            const cacheKey = this.getCacheKey(`id:${id}`);
            console.log(`[${this.modelName}] 🔍 GET cache key: ${cacheKey}`);
            const cached = await this.redis.get<T>(cacheKey);
            if (cached) {
                console.log(`[${this.modelName}] ✅ CACHE HIT: ${cacheKey}`);
                return cached;
            }

            console.log(`[${this.modelName}] ❌ CACHE MISS: ${cacheKey}`);
            const data = await this.model.findUnique({
                where: { id },
                include,
            });

            if (data) {
                await this.redis.set(cacheKey, data, cacheTTL);
                console.log(
                    `[${this.modelName}] 💾 SET cache key: ${cacheKey}`
                );
            }
            return data;
        }

        return this.model.findUnique({
            where: { id },
            include,
        });
    }

    /**
     * Tạo mới một bản ghi
     * @param data - Dữ liệu tạo mới
     * @param userId - ID của user (dùng để invalidate cache đúng scope)
     */
    async create(data: any, userId?: string): Promise<T> {
        const result = await this.model.create({
            data: {
                ...data,
                createdBy: userId,
                updatedBy: userId,
            },
        });

        // Invalidate user-scoped cache if userId provided
        if (userId) {
            console.log(
                `[${this.modelName}] 🗑️ CREATE -> invalidating list cache for user: ${userId}`
            );
            await this.invalidateUserListCache(userId);
            await this.invalidateOneCache(userId);
        }

        return result;
    }

    /**
     * Tạo nhiều bản ghi
     */
    async createMany(data: any[], userId?: string): Promise<{ count: number }> {
        const result = await this.model.createMany({
            data: data.map((item) => ({
                ...item,
                createdBy: userId,
                updatedBy: userId,
            })),
        });

        // Invalidate user-scoped cache if userId provided
        if (userId) {
            console.log(
                `[${this.modelName}] 🗑️ CREATE_MANY -> invalidating list cache for user: ${userId}`
            );
            await this.invalidateUserListCache(userId);
        }

        return result;
    }

    /**
     * Cập nhật bản ghi theo ID
     * @param id - ID của bản ghi
     * @param data - Dữ liệu cập nhật
     * @param userId - ID của user sở hữu (để invalidate đúng cache)
     */
    async update(
        id: string | number,
        data: any,
        userId?: string,
        tx?: any
    ): Promise<T> {
        const result = await this.modelOf(tx).update({
            where: { id },
            data: {
                ...data,
                updatedBy: userId,
            },
        });

        // Inside a caller tx the caches are cleared by `invalidateWrite` after commit.
        if (!tx) await this.invalidateWrite('UPDATE', id, userId);
        return result;
    }

    /**
     * Cập nhật hoặc tạo mới (upsert)
     */
    async upsert(params: {
        where: any;
        create: any;
        update: any;
        userId?: string;
    }): Promise<T> {
        const result = await this.model.upsert({
            where: params.where,
            create: {
                ...params.create,
                createdBy: params.userId,
                updatedBy: params.userId,
            },
            update: {
                ...params.update,
                updatedBy: params.userId,
            },
        });

        // Invalidate user-scoped cache if userId provided
        if (params.userId) {
            console.log(
                `[${this.modelName}] 🗑️ UPSERT -> invalidating list cache for user: ${params.userId}`
            );
            await this.invalidateUserListCache(params.userId);
            await this.invalidateOneCache(
                params.userId,
                (result as any)?.id
            );
            // Also invalidate item cache if we have an id
            if (result && (result as any).id) {
                console.log(
                    `[${this.modelName}] 🗑️ UPSERT -> invalidating item cache id:${(result as any).id} for user: ${params.userId}`
                );
                await this.invalidateItemCache(
                    params.userId,
                    String((result as any).id)
                );
            }
        }

        return result;
    }

    /**
     * Cập nhật nhiều bản ghi
     */
    async updateMany(params: {
        where: any;
        data: any;
        userId?: string;
    }): Promise<{ count: number }> {
        const result = await this.model.updateMany({
            where: params.where,
            data: {
                ...params.data,
                updatedBy: params.userId,
            },
        });

        // Invalidate user-scoped cache if userId provided
        if (params.userId) {
            console.log(
                `[${this.modelName}] 🗑️ UPDATE_MANY -> invalidating list cache for user: ${params.userId}`
            );
            await this.invalidateUserListCache(params.userId);
            await this.invalidateOneCache(params.userId);
        }

        return result;
    }

    /**
     * Xóa vĩnh viễn (hard delete)
     * @param id - ID của bản ghi
     * @param userId - ID của user sở hữu (để invalidate đúng cache)
     */
    async delete(
        id: string | number,
        userId?: string,
        tx?: any
    ): Promise<T> {
        const result = await this.modelOf(tx).delete({
            where: { id },
        });

        // Inside a caller tx the caches are cleared by `invalidateWrite` after commit.
        if (!tx) await this.invalidateWrite('DELETE', id, userId);
        return result;
    }

    /**
     * Cache invalidation of a single-row write. `update`/`delete` call it
     * themselves; callers that pass their own `tx` must call it AFTER the tx
     * commits (invalidating earlier lets a concurrent read re-cache the old row).
     */
    public async invalidateWrite(
        op: 'UPDATE' | 'DELETE',
        id: string | number,
        userId?: string
    ): Promise<void> {
        // Invalidate user-scoped caches if userId provided
        if (userId) {
            console.log(
                `[${this.modelName}] 🗑️ ${op} id:${id} -> invalidating item & list cache for user: ${userId}`
            );
            await this.invalidateItemCache(userId, String(id));
            await this.invalidateUserListCache(userId);
            await this.invalidateOneCache(userId, id);
        } else {
            // Fallback to legacy cache invalidation
            const legacyKey = this.getCacheKey(`id:${id}`);
            console.log(
                `[${this.modelName}] 🗑️ ${op} id:${id} -> deleting legacy cache: ${legacyKey}`
            );
            await this.redis.del(legacyKey);
            await this.invalidateOneCache(undefined, id);
        }
    }

    /**
     * Xóa mềm (soft delete)
     */
    async softDelete(id: string | number, userId?: string): Promise<T> {
        const result = await this.model.update({
            where: { id },
            data: {
                deletedAt: new Date(),
                updatedBy: userId,
            },
        });

        // Invalidate user-scoped caches if userId provided
        if (userId) {
            console.log(
                `[${this.modelName}] 🗑️ SOFT_DELETE id:${id} -> invalidating item & list cache for user: ${userId}`
            );
            await this.invalidateItemCache(userId, String(id));
            await this.invalidateUserListCache(userId);
            await this.invalidateOneCache(userId, id);
        } else {
            // Fallback to legacy cache invalidation
            const legacyKey = this.getCacheKey(`id:${id}`);
            console.log(
                `[${this.modelName}] 🗑️ SOFT_DELETE id:${id} -> deleting legacy cache: ${legacyKey}`
            );
            await this.redis.del(legacyKey);
            await this.invalidateOneCache(undefined, id);
        }

        return result;
    }

    /**
     * Xóa nhiều bản ghi
     * @param where - Điều kiện xóa
     * @param userId - ID của user sở hữu (để invalidate đúng cache)
     */
    async deleteMany(where: any, userId?: string): Promise<{ count: number }> {
        const result = await this.model.deleteMany({ where });

        // Invalidate user-scoped cache if userId provided
        if (userId) {
            await this.invalidateUserListCache(userId);
        }

        return result;
    }

    /**
     * Đếm số lượng bản ghi với cache
     */
    async count(
        where?: any,
        cache = true,
        cacheTTL = this.defaultCacheTTL
    ): Promise<number> {
        if (cache) {
            const cacheKey = this.getCacheKey(
                `count:${JSON.stringify(where || {})}`
            );
            const cached = await this.redis.get<number>(cacheKey);
            if (cached !== null) return cached;

            const count = await this.model.count({ where });
            await this.redis.set(cacheKey, count, cacheTTL);
            return count;
        }

        return this.model.count({ where });
    }

    /**
     * Phân trang với tìm kiếm và lọc - có cache
     * @param params - Pagination parameters
     * @param userId - User ID for user-scoped cache (required when cache=true)
     */
    async paginate(
        params: PaginationParams & { cache?: boolean; cacheTTL?: EXPIRED_TIME },
        userId?: string
    ): Promise<PaginationResult<T>> {
        const {
            page = 1,
            size = 10,
            sortBy = 'createdAt',
            sortType = 'desc',
            dateFrom,
            dateTo,
            searchBy = [],
            text,
            cache = false,
            cacheTTL = this.defaultCacheTTL,
            include,
            select,
            ...filters
        } = params;

        // Ensure page and size are numbers (convert from string if needed)
        const pageNum = typeof page === 'string' ? parseInt(page, 10) : page;
        const sizeNum = typeof size === 'string' ? parseInt(size, 10) : size;

        const where: any = {
            ...filters,
        };

        for (const key in where) {
            if (where[key] === 'true') where[key] = true;
            else if (where[key] === 'false') where[key] = false;
        }

        // Xử lý tìm kiếm
        if (text && searchBy.length > 0) {
            where.OR = searchBy.map((field) => ({
                [field]: {
                    contains: text,
                    mode: 'insensitive',
                },
            }));
        }

        // Xử lý lọc theo ngày
        if (dateFrom || dateTo) {
            where.createdAt = {
                ...(dateFrom && { gte: new Date(dateFrom) }),
                ...(dateTo && { lte: new Date(dateTo) }),
            };
        }

        // Generate cache key - use user-scoped if userId provided
        const cacheKeySuffix = `paginate:${pageNum}:${sizeNum}:${JSON.stringify(where)}`;
        const cacheKey = userId
            ? this.ns(
                  getListCachePattern(this.cacheModule, userId).replace(
                      '*',
                      cacheKeySuffix
                  )
              )
            : this.getCacheKey(cacheKeySuffix);

        if (cache) {
            console.log(`[${this.modelName}] 🔍 GET cache key: ${cacheKey}`);
            const cached = await this.redis.get<PaginationResult<T>>(cacheKey);
            if (cached) {
                console.log(`[${this.modelName}] ✅ CACHE HIT: ${cacheKey}`);
                return cached;
            }
            console.log(`[${this.modelName}] ❌ CACHE MISS: ${cacheKey}`);
        }

        const findManyOptions: any = {
            where,
            orderBy: { [sortBy]: sortType },
            skip: (pageNum - 1) * sizeNum,
            take: sizeNum,
        };

        if (include) {
            findManyOptions.include = include;
        }

        if (select) {
            findManyOptions.select = select;
        }

        const [data, total] = await Promise.all([
            this.model.findMany(findManyOptions),
            this.model.count({ where }),
        ]);

        const result = {
            data,
            total,
            page: pageNum,
            size: sizeNum,
            totalPages: Math.ceil(total / sizeNum),
        };

        if (cache) {
            console.log(`[${this.modelName}] 💾 SET cache key: ${cacheKey}`);
            await this.redis.set(cacheKey, result, cacheTTL);
        }

        return result;
    }

    /**
     * Transaction wrapper
     */
    async withTransaction<R>(fn: (tx: any) => Promise<R>): Promise<R> {
        return this.prisma.$transaction(fn);
    }

    /**
     * Aggregate operations
     */
    async aggregate(params: any) {
        return this.model.aggregate(params);
    }

    /**
     * Group by operations
     */
    async groupBy(params: any) {
        return this.model.groupBy(params);
    }
}
