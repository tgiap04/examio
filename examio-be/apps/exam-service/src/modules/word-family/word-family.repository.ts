import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@examio/database';
import { RedisService, EXPIRED_TIME } from '@examio/redis';
import { WordFamilyCategory, WordFamily, UserSavedWordFamily } from '@prisma/client';

@Injectable()
export class WordFamilyRepository {
    private readonly logger = new Logger(WordFamilyRepository.name);
    private readonly CACHE_TTL = EXPIRED_TIME.THIRTY_MINUTES;

    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
    ) {}

    // ==================== Category ====================

    async findCategories(): Promise<WordFamilyCategory[]> {
        const cacheKey = 'wf:categories:all';
        const cached = await this.redis.get<WordFamilyCategory[]>(cacheKey);
        if (cached) return cached;

        const categories = await this.prisma.wordFamilyCategory.findMany({
            where: { isActive: true },
            orderBy: { order: 'asc' },
        });

        await this.redis.set(cacheKey, categories, this.CACHE_TTL);
        return categories;
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
        data: Partial<{ name: string; description: string; imageUrl: string; order: number; isActive: boolean }>,
    ): Promise<WordFamilyCategory> {
        const category = await this.prisma.wordFamilyCategory.update({
            where: { id },
            data,
        });
        await this.invalidateCategoriesCache();
        return category;
    }

    async deleteCategory(id: string): Promise<void> {
        await this.prisma.wordFamilyCategory.update({
            where: { id },
            data: { isActive: false },
        });
        await this.invalidateCategoriesCache();
    }

    // ==================== WordFamily ====================

    async findWordFamiliesByCategory(categorySlug: string) {
        const cacheKey = `wf:category:${categorySlug}:roots`;
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
        const cacheKey = `wf:detail:${rootWord}:${categorySlug}`;
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
        await this.redis.del(`wf:detail:${data.rootWord}:${data.categorySlug}`);
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
        const cacheKey = `wf:saved:${userId}`;
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
        await this.redis.del('wf:categories:all');
    }

    private async invalidateCategoryCache(categorySlug: string): Promise<void> {
        await this.redis.del(`wf:category:${categorySlug}:roots`);
        await this.redis.del('wf:categories:all');
    }
}
