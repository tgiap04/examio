export interface WordFamilyWord {
    word: string;
    pos: string;
    meaningEn: string;
    meaningVi: string;
    example: string;
    affix: {
        prefix: string;
        root: string;
        suffix: string;
    };
}

export interface WordFamilyData {
    rootWord: string;
    categorySlug: string;
    words: WordFamilyWord[];
}

export interface AiWordFamilyRequest {
    categorySlug: string;
    categoryName: string;
    numRootWords: number;
    excludeRootWords: string[];
    rootWord?: string;
    modelType?: string;
}

export interface AiWordFamilyResponse {
    success: boolean;
    data?: WordFamilyData;
    error?: string;
}
