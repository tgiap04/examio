import {
    Injectable,
    Logger,
    NotFoundException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { RedisService, EXPIRED_TIME } from '@examio/redis';
import { User } from '@prisma/client';
import { WordFamilyRepository } from './word-family.repository';
import { WordFamilyData, AiWordFamilyResponse } from './interfaces/word-family.interface';
import { GenerateWordFamilyDto, SaveWordFamilyDto } from './dto/word-family.dto';

@Injectable()
export class WordFamilyService {
    private readonly logger = new Logger(WordFamilyService.name);
    private readonly aiServiceUrl: string;
    private readonly GENERATION_LOCK_TTL = EXPIRED_TIME.THIRTY_MINUTES;

    constructor(
        private readonly repository: WordFamilyRepository,
        private readonly httpService: HttpService,
        private readonly redis: RedisService,
    ) {
        this.aiServiceUrl =
            process.env.AI_SERVICE_URL || 'http://localhost:8000/api';
    }

    // ==================== Categories ====================

    async getCategories() {
        return this.repository.findCategories();
    }

    async createCategory(data: {
        name: string;
        slug: string;
        description?: string;
        imageUrl?: string;
        order?: number;
    }) {
        const existing = await this.repository.findCategoryBySlug(data.slug);
        if (existing) {
            throw new ConflictException(
                `Danh mục với slug "${data.slug}" đã tồn tại.`,
            );
        }
        return this.repository.createCategory(data);
    }

    async updateCategory(
        id: string,
        data: Partial<{ name: string; description: string; imageUrl: string; order: number }>,
    ) {
        const category = await this.repository.findCategoryById(id);
        if (!category) {
            throw new NotFoundException('Không tìm thấy danh mục.');
        }
        return this.repository.updateCategory(id, data);
    }

    async deleteCategory(id: string) {
        const category = await this.repository.findCategoryById(id);
        if (!category) {
            throw new NotFoundException('Không tìm thấy danh mục.');
        }
        return this.repository.deleteCategory(id);
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
        return family;
    }

    // ==================== AI Generation ====================

    async generateWordFamily(user: User, dto: GenerateWordFamilyDto) {
        const { categorySlug, numRootWords = 10, excludeRootWords = [] } = dto;

        const category = await this.repository.findCategoryBySlug(categorySlug);
        if (!category) {
            throw new NotFoundException('Không tìm thấy danh mục.');
        }

        // Dedup: get already generated root words
        const existingRoots = await this.repository.getExistingRootWords(categorySlug);
        const allExcludes = [...new Set([...excludeRootWords, ...existingRoots])];

        // Acquire lock atomically to prevent duplicate generation
        const lockKey = `wf:gen:lock:${user.id}:${categorySlug}`;
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

            const response = await firstValueFrom(
                this.httpService.post<AiWordFamilyResponse>(
                    `${this.aiServiceUrl}/generate/word-family`,
                    payload,
                    {
                        timeout: 600000,
                        headers: {
                            'x-internal-service-token':
                                process.env.INTERNAL_SERVICE_TOKEN || '',
                        },
                    },
                ),
            );

            if (!response.data?.success || !response.data.data) {
                throw new BadRequestException(
                    response.data?.error || 'Sinh word family thất bại.',
                );
            }

            const wordFamilyData = response.data.data;

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

    // ==================== User Collections ====================

    async saveToCollection(user: User, dto: SaveWordFamilyDto) {
        const family = await this.repository.findWordFamilyById(dto.wordFamilyId);
        if (!family) {
            throw new NotFoundException('Không tìm thấy word family.');
        }

        const saved = await this.repository.saveWordFamily(user.id, dto.wordFamilyId);
        await this.redis.del(`wf:saved:${user.id}`);
        return saved;
    }

    async getSavedCollections(user: User) {
        return this.repository.findSavedWordFamilies(user.id);
    }

    async removeFromCollection(user: User, wordFamilyId: string) {
        await this.repository.removeSavedWordFamily(user.id, wordFamilyId);
        await this.redis.del(`wf:saved:${user.id}`);
        return { message: 'Đã xóa khỏi bộ sưu tập.' };
    }
}
