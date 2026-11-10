import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { wordFamilyV1 } from '@examio/contracts';
import { WordFamilyRepository } from './word-family.repository';
import type { WordFamilyData, WordFamilyWord } from './interfaces/word-family.interface';

const fail = (code: status, message: string): never => {
    throw new RpcException({ code, message });
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Backs `WordFamilyService.GetWordFamily`: the catalog row plus its category
 * name, shaped for the content-service flashcard bridge. Rows are shared catalog
 * data, so no per-user check applies.
 */
@Injectable()
export class WordFamilyLookupService {
    constructor(private readonly repo: WordFamilyRepository) {}

    async getWordFamily(id: string): Promise<wordFamilyV1.GetWordFamilyResponse> {
        if (!id) return fail(status.INVALID_ARGUMENT, 'id is required');
        const family = await this.repo.findWordFamilyById(id);
        if (!family) return fail(status.NOT_FOUND, 'Word family not found');

        const data = family.data as Partial<WordFamilyData> | null;
        if (!data?.rootWord || !Array.isArray(data.words)) {
            return fail(status.FAILED_PRECONDITION, 'Word family data is invalid');
        }
        const categorySlug = data.categorySlug ?? family.categorySlug;
        const category = await this.repo.findCategoryBySlug(categorySlug);
        return {
            wordFamily: {
                id: family.id,
                rootWord: data.rootWord,
                categorySlug,
                categoryName: category?.name ?? categorySlug,
                words: data.words.map((w: Partial<WordFamilyWord>) => ({
                    word: text(w?.word),
                    pos: text(w?.pos),
                    meaningEn: text(w?.meaningEn),
                    meaningVi: text(w?.meaningVi),
                    example: text(w?.example),
                })),
            },
        };
    }
}
