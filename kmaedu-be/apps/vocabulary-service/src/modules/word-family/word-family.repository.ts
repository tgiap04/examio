import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { RedisService, EXPIRED_TIME } from '@kmaedu/redis';
import { R2DeleteTaskWriter } from '@kmaedu/messaging';
import { WordFamilyCategory, WordFamily, UserSavedWordFamily } from '../../prisma';

@Injectable()
export class WordFamilyRepository {
    private readonly logger = new Logger(WordFamilyRepository.name);
    private readonly CACHE_TTL = EXPIRED_TIME.THIRTY_MINUTES;

    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
        private readonly r2Deletes: R2DeleteTaskWriter,
    ) {}

    // ==================== Category ====================

    async findCategories(): Promise<WordFamilyCategory[]> {
        const cacheKey = 'vocab:categories:all';
        const cached = await this.redis.get<WordFamilyCategory[]>(cacheKey);
        if (cached) return cached;

        const categories = await this.prisma.wordFamilyCategory.findMany({
            where: { isActive: true },
            orderBy: { order: 'asc' },
        });

        await this.redis.set(cacheKey, categories, this.CACHE_TTL);
        return categories;
    }

    /** Admin view: every category (inactive ones only on request), stable order. */
    async listCategories(includeInactive: boolean): Promise<WordFamilyCategory[]> {
        return this.prisma.wordFamilyCategory.findMany({
            where: includeInactive ? undefined : { isActive: true },
            orderBy: [{ order: 'asc' }, { name: 'asc' }],
        });
    }

    async findCategoryById(id: string): Promise<WordFamilyCategory | null> {
        return this.prisma.wordFamilyCategory.findUnique({ where: { id } });
    }

    async findCategoryBySlug(slug: string): Promise<WordFamilyCategory | null> {
        return this.prisma.wordFamilyCategory.findUnique({ where: { slug } });
    }

    async createCategory(data: {
        name: string;
        slug: string;
        description?: string;
        imageUrl?: string;
        order?: number;
    }): Promise<WordFamilyCategory> {
        const category = await this.prisma.wordFamilyCategory.create({ data });
        await this.invalidateCategoriesCache();
        return category;
    }

    async updateCategory(
        id: string,
        data: Partial<{ name: string; description: string; imageUrl: string | null; order: number; isActive: boolean }>,
        r2KeysToDelete: string[] = [],
    ): Promise<WordFamilyCategory> {
        // The R2 cleanup tasks commit with the row change or not at all.
        const category = await this.prisma.$transaction(async (tx) => {
            const row = await tx.wordFamilyCategory.update({ where: { id }, data });
            await this.r2Deletes.enqueue(tx, r2KeysToDelete);
            return row;
        });
        await this.invalidateCategoriesCache();
        return category;
    }

    // ==================== WordFamily ====================

    async findWordFamiliesByCategory(categorySlug: string) {
        const cacheKey = `vocab:category:${categorySlug}:roots`;
        const cached = await this.redis.get(cacheKey);
        if (cached) return cached;

        const families = await this.prisma.wordFamily.findMany({
            where: { categorySlug },
            select: { id: true, rootWord: true, categorySlug: true, createdAt: true, updatedAt: true },
            orderBy: { rootWord: 'asc' },
        });

        await this.redis.set(cacheKey, families, this.CACHE_TTL);
        return families;
    }

    async findWordFamilyByRoot(
        rootWord: string,
        categorySlug: string,
    ): Promise<WordFamily | null> {
        const cacheKey = `vocab:detail:${rootWord}:${categorySlug}`;
        const cached = await this.redis.get<WordFamily>(cacheKey);
        if (cached) return cached;

        const family = await this.prisma.wordFamily.findUnique({
            where: { rootWord_categorySlug: { rootWord, categorySlug } },
        });

        if (family) {
            await this.redis.set(cacheKey, family, this.CACHE_TTL);
        }
        return family;
    }

    async findWordFamilyById(id: string): Promise<WordFamily | null> {
        return this.prisma.wordFamily.findUnique({ where: { id } });
    }

    async createWordFamily(data: {
        rootWord: string;
        categoryId: string;
        categorySlug: string;
        data: object;
    }): Promise<WordFamily> {
        const family = await this.prisma.wordFamily.upsert({
            where: {
                rootWord_categorySlug: {
                    rootWord: data.rootWord,
                    categorySlug: data.categorySlug,
                },
            },
            update: { data: data.data },
            create: {
                rootWord: data.rootWord,
                categoryId: data.categoryId,
                categorySlug: data.categorySlug,
                data: data.data,
            },
        });

        await this.invalidateCategoryCache(data.categorySlug);
        await this.redis.del(`vocab:detail:${data.rootWord}:${data.categorySlug}`);
        return family;
    }

    async getExistingRootWords(categorySlug: string): Promise<string[]> {
        const families = await this.prisma.wordFamily.findMany({
            where: { categorySlug },
            select: { rootWord: true },
        });
        return families.map((f) => f.rootWord);
    }

    // ==================== UserSavedWordFamily ====================

    async saveWordFamily(
        userId: string,
        wordFamilyId: string,
    ): Promise<UserSavedWordFamily> {
        return this.prisma.userSavedWordFamily.upsert({
            where: {
                userId_wordFamilyId: { userId, wordFamilyId },
            },
            update: {},
            create: { userId, wordFamilyId },
        });
    }

    async removeSavedWordFamily(
        userId: string,
        wordFamilyId: string,
    ): Promise<void> {
        await this.prisma.userSavedWordFamily.deleteMany({
            where: { userId, wordFamilyId },
        });
    }

    async findSavedWordFamilies(userId: string) {
        const cacheKey = `vocab:saved:${userId}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) return cached;

        const saved = await this.prisma.userSavedWordFamily.findMany({
            where: { userId },
            include: {
                wordFamily: true,
            },
            orderBy: { savedAt: 'desc' },
        });

        await this.redis.set(cacheKey, saved, this.CACHE_TTL);
        return saved;
    }

    // ==================== Cache Invalidation ====================

    private async invalidateCategoriesCache(): Promise<void> {
        await this.redis.del('vocab:categories:all');
    }

    private async invalidateCategoryCache(categorySlug: string): Promise<void> {
        await this.redis.del(`vocab:category:${categorySlug}:roots`);
        await this.redis.del('vocab:categories:all');
    }
}
