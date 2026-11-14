import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { RedisService, EXPIRED_TIME } from '@kmaedu/redis';
import { AiClient } from '../../clients/ai.client';
import { WordFamilyRepository } from './word-family.repository';
import {
    WordFamilyData,
    AiWordFamilyRequest,
} from './interfaces/word-family.interface';
import {
    GenerateWordFamilyDto,
    GenerateRootWordFamilyDto,
    SaveWordFamilyDto,
} from './dto/word-family.dto';
import type { AuthUser } from '@kmaedu/auth-jwt';
import { consumeDailyGeneration } from './word-family-generation-limit';

@Injectable()
export class WordFamilyService {
    private readonly logger = new Logger(WordFamilyService.name);
    private readonly GENERATION_LOCK_TTL = EXPIRED_TIME.THIRTY_MINUTES;

    constructor(
        private readonly repository: WordFamilyRepository,
        private readonly ai: AiClient,
        private readonly redis: RedisService,
    ) {}

    // ==================== Categories ====================

    async getCategories() {
        return this.repository.findCategories();
    }

    // ==================== Root Words ====================

    async getRootWords(categorySlug: string) {
        const category = await this.repository.findCategoryBySlug(categorySlug);
        if (!category) {
            throw new NotFoundException('Không tìm thấy danh mục.');
        }

        const families = await this.repository.findWordFamiliesByCategory(categorySlug);
        return {
            category,
            rootWords: families.map((f: { id: string; rootWord: string; createdAt: Date }) => ({
                id: f.id,
                rootWord: f.rootWord,
                createdAt: f.createdAt,
            })),
            total: families.length,
        };
    }

    // ==================== Word Family Detail ====================

    async getWordFamily(rootWord: string, categorySlug: string) {
        const family = await this.repository.findWordFamilyByRoot(rootWord, categorySlug);
        if (!family) {
            throw new NotFoundException(
                `Không tìm thấy word family "${rootWord}" trong danh mục "${categorySlug}".`,
            );
        }
        // The client (WordFamilyData) expects the payload flattened onto the
        // record; the row stores it under the `data` JSON column. Flatten here so
        // the detail page can read `words` directly.
        const data = family.data as unknown as WordFamilyData;
        return {
            id: family.id,
            rootWord: family.rootWord,
            categorySlug: family.categorySlug,
            words: data?.words ?? [],
            createdAt: family.createdAt,
            updatedAt: family.updatedAt,
        };
    }

    // ==================== AI Generation ====================

    private generationLockKey(userId: string, categorySlug: string) {
        return `vocab:gen:lock:${userId}:${categorySlug}`;
    }

    // Root-specific lock: keeps single-root regeneration independent from the
    // category-wide "generate more" flow, so their status/UI never cross-bleed
    // and two different roots can generate in parallel.
    private rootGenerationLockKey(
        userId: string,
        categorySlug: string,
        rootWord: string,
    ) {
        return `${this.generationLockKey(userId, categorySlug)}:${rootWord}`;
    }

    async getGenerationStatus(user: AuthUser, categorySlug: string) {
        // The lock value is a raw ISO timestamp set via getClient().set (not JSON),
        // so read it through the raw client to avoid JSON.parse in redis.get().
        const startedAt = await this.redis
            .getClient()
            .get(this.generationLockKey(user.id, categorySlug));
        return {
            categorySlug,
            generating: startedAt !== null,
            startedAt,
        };
    }

    async getRootGenerationStatus(
        user: AuthUser,
        categorySlug: string,
        rootWord: string,
    ) {
        const startedAt = await this.redis
            .getClient()
            .get(this.rootGenerationLockKey(user.id, categorySlug, rootWord.trim()));
        return {
            categorySlug,
            rootWord,
            generating: startedAt !== null,
            startedAt,
        };
    }

    async generateWordFamily(user: AuthUser, dto: GenerateWordFamilyDto) {
        const { categorySlug, numRootWords = 10, excludeRootWords = [] } = dto;

        const category = await this.repository.findCategoryBySlug(categorySlug);
        if (!category) {
            throw new NotFoundException('Không tìm thấy danh mục.');
        }

        await consumeDailyGeneration(this.redis.getClient(), user.id);

        // Dedup: get already generated root words
        const existingRoots = await this.repository.getExistingRootWords(categorySlug);
        const allExcludes = [...new Set([...excludeRootWords, ...existingRoots])];

        // Acquire lock atomically to prevent duplicate generation
        const lockKey = this.generationLockKey(user.id, categorySlug);
        const acquired = await this.redis.getClient().set(
            lockKey,
            new Date().toISOString(),
            'EX',
            this.GENERATION_LOCK_TTL,
            'NX',
        );
        if (!acquired) {
            throw new ConflictException(
                `Bạn đang có job sinh word family cho danh mục này chưa hoàn tất. Vui lòng đợi.`,
            );
        }

        try {
            const payload = {
                categorySlug,
                categoryName: category.name,
                numRootWords,
                excludeRootWords: allExcludes,
            };

            this.logger.log(
                `Generating word family: category=${categorySlug}, numRoots=${numRootWords}, excludes=${allExcludes.length}`,
            );

            const response = await this.ai.generateWordFamily(payload);

            if (!response?.success || !response.data) {
                throw new BadRequestException(
                    response?.error || 'Sinh word family thất bại.',
                );
            }

            const wordFamilyData = response.data;

            // Verify categorySlug matches
            if (wordFamilyData.categorySlug !== categorySlug) {
                this.logger.warn(
                    `AI returned categorySlug "${wordFamilyData.categorySlug}" != requested "${categorySlug}"`,
                );
            }

            // Save to DB
            const saved = await this.repository.createWordFamily({
                rootWord: wordFamilyData.rootWord,
                categoryId: category.id,
                categorySlug: wordFamilyData.categorySlug,
                data: wordFamilyData as unknown as object,
            });

            this.logger.log(
                `Word family generated: root=${wordFamilyData.rootWord}, words=${wordFamilyData.words.length}`,
            );

            return saved;
        } catch (error: any) {
            if (error instanceof BadRequestException || error instanceof NotFoundException) {
                throw error;
            }
            this.logger.error(`Word family generation failed: ${error.message}`, error.stack);
            throw new BadRequestException(
                error?.message || 'Sinh word family thất bại.',
            );
        } finally {
            await this.redis.del(lockKey);
        }
    }

    async generateWordFamilyForRoot(
        user: AuthUser,
        dto: GenerateRootWordFamilyDto,
    ) {
        const { categorySlug } = dto;
        const rootWord = dto.rootWord.trim();

        const category = await this.repository.findCategoryBySlug(categorySlug);
        if (!category) {
            throw new NotFoundException('Không tìm thấy danh mục.');
        }

        await consumeDailyGeneration(this.redis.getClient(), user.id);

        // Root-specific lock: independent from the category-wide flow and from
        // other roots. The client polls generation-status/:slug/:rootWord.
        const lockKey = this.rootGenerationLockKey(user.id, categorySlug, rootWord);
        const startedAt = new Date().toISOString();
        const acquired = await this.redis.getClient().set(
            lockKey,
            startedAt,
            'EX',
            this.GENERATION_LOCK_TTL,
            'NX',
        );
        if (!acquired) {
            throw new ConflictException(
                `Đang sinh từ con cho "${rootWord}" chưa hoàn tất. Vui lòng đợi.`,
            );
        }

        // Run the AI call in the background and return immediately: the model
        // call can take minutes, which would otherwise time out at the gateway
        // proxy. The client polls generation-status/:slug and refetches the
        // detail once the lock clears.
        void this.runRootGeneration(category, categorySlug, rootWord, lockKey);

        return { generating: true, categorySlug, rootWord, startedAt };
    }

    /**
     * Background worker for single-root generation: calls the AI service, upserts
     * the result, and ALWAYS releases the lock. Errors are logged, never thrown —
     * no caller awaits this.
     */
    private async runRootGeneration(
        category: { id: string; name: string },
        categorySlug: string,
        rootWord: string,
        lockKey: string,
    ) {
        try {
            const payload: AiWordFamilyRequest = {
                categorySlug,
                categoryName: category.name,
                numRootWords: 1,
                excludeRootWords: [],
                rootWord,
            };

            this.logger.log(
                `Generating word family for root: category=${categorySlug}, rootWord=${rootWord}`,
            );

            const response = await this.ai.generateWordFamily(payload);

            if (!response?.success || !response.data) {
                this.logger.error(
                    `AI word family generation failed for root=${rootWord}: ${response?.error || 'unknown error'}`,
                );
                return;
            }

            const wordFamilyData = response.data;

            // Force the requested root word so the upsert overwrites the exact
            // record the detail page is displaying.
            await this.repository.createWordFamily({
                rootWord,
                categoryId: category.id,
                categorySlug,
                data: {
                    ...wordFamilyData,
                    rootWord,
                    categorySlug,
                } as unknown as object,
            });

            this.logger.log(
                `Word family generated for root=${rootWord}, words=${wordFamilyData.words.length}`,
            );
        } catch (error: any) {
            this.logger.error(
                `Word family root generation failed: ${error?.message}`,
                error?.stack,
            );
        } finally {
            await this.redis.del(lockKey);
        }
    }

    // ==================== User Collections ====================

    async saveToCollection(user: AuthUser, dto: SaveWordFamilyDto) {
        const family = await this.repository.findWordFamilyById(dto.wordFamilyId);
        if (!family) {
            throw new NotFoundException('Không tìm thấy word family.');
        }

        const saved = await this.repository.saveWordFamily(user.id, dto.wordFamilyId);
        await this.redis.del(`vocab:saved:${user.id}`);
        return saved;
    }

    async getSavedCollections(user: AuthUser) {
        return this.repository.findSavedWordFamilies(user.id);
    }

    async removeFromCollection(user: AuthUser, wordFamilyId: string) {
        await this.repository.removeSavedWordFamily(user.id, wordFamilyId);
        await this.redis.del(`vocab:saved:${user.id}`);
        return { message: 'Đã xóa khỏi bộ sưu tập.' };
    }
}
