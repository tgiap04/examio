import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ApiProperty } from '@nestjs/swagger';

// Số quiz/flashcard tối đa cho mỗi lần generate
export const MAX_GENERATE_ITEMS = 50;

export const RegenerateSchema = z.object({
    // FE sends typeResult: 1 = quiz, 2 = flashcard
    typeResult: z.number().optional(),
    quantityQuizz: z.number().int().min(1).max(MAX_GENERATE_ITEMS).optional(),
    quantityFlashcard: z.number().int().min(1).max(MAX_GENERATE_ITEMS).optional(),
    isNarrowSearch: z.boolean().optional(),
    keyword: z.string().optional(),
    modelType: z.string().optional(), // model id tu registry
    // Legacy fields for backward compatibility
    outputType: z.enum(['quiz', 'flashcard']).optional(),
    count: z.number().int().min(1).max(MAX_GENERATE_ITEMS).optional(),
});

export class RegenerateDto extends createZodDto(RegenerateSchema) {
    @ApiProperty({
        description: 'Loại output: 1 = quiz, 2 = flashcard',
        required: false,
    })
    typeResult?: number;

    @ApiProperty({ description: 'Số câu hỏi quiz', required: false })
    quantityQuizz?: number;

    @ApiProperty({ description: 'Số flashcard', required: false })
    quantityFlashcard?: number;

    @ApiProperty({ description: 'Tìm kiếm hẹp', required: false })
    isNarrowSearch?: boolean;

    @ApiProperty({ description: 'Từ khóa tìm kiếm', required: false })
    keyword?: string;

    @ApiProperty({
        description: 'Model AI id tu registry',
        required: false,
    })
    modelType?: string;

    @ApiProperty({
        description: 'Loại output (legacy)',
        enum: ['quiz', 'flashcard'],
        required: false,
    })
    outputType?: 'quiz' | 'flashcard';

    @ApiProperty({
        description: 'Số lượng items cần tạo (legacy)',
        required: false,
    })
    count?: number;
}

// DTO for generate-from-file endpoint (multipart form data)
export const GenerateFromFileSchema = z.object({
    typeResult: z.string(),
    quantityQuizz: z.string().optional(),
    quantityFlashcard: z.string().optional(),
    isNarrowSearch: z.string().optional(), // Form data sends boolean as string 'true'/'false'
    keyword: z.string().optional(),
    modelType: z.string().optional(),
});

export class GenerateFromFileDto extends createZodDto(GenerateFromFileSchema) {
    @ApiProperty({ description: 'Loại output: 0 = flashcard, 1 = quiz' })
    typeResult: string;

    @ApiProperty({ description: 'Số câu hỏi quiz', required: false })
    quantityQuizz?: string;

    @ApiProperty({ description: 'Số flashcard', required: false })
    quantityFlashcard?: string;

    @ApiProperty({
        description: 'Tìm kiếm hẹp (true/false string)',
        required: false,
    })
    isNarrowSearch?: string;

    @ApiProperty({ description: 'Từ khóa tìm kiếm', required: false })
    keyword?: string;

    @ApiProperty({
        description: 'Model AI id tu registry',
        required: false,
    })
    modelType?: string;
}

export const TutorMessageSchema = z.object({
    role: z.string(),
    content: z.string(),
});

export const TutorIngestSchema = z.object({
    sourcePath: z.string(),
    courseCode: z.string(),
    language: z.string().optional(),
    topic: z.string().optional(),
    difficulty: z.enum(['basic', 'intermediate', 'advanced']).optional(),
    reindexMode: z
        .enum(['incremental', 'full', 'graph-only', 'embedding-only'])
        .optional(),
    licenseTag: z.string().optional(),
    dryRun: z.boolean().optional(),
    triggeredBy: z.string().optional(),
});

export class TutorIngestDto extends createZodDto(TutorIngestSchema) {
    @ApiProperty({ description: 'Đường dẫn nguồn dữ liệu' })
    sourcePath: string;

    @ApiProperty({ description: 'Mã học phần' })
    courseCode: string;

    @ApiProperty({ description: 'Ngôn ngữ', required: false })
    language?: string;

    @ApiProperty({ description: 'Chủ đề', required: false })
    topic?: string;

    @ApiProperty({ required: false, enum: ['basic', 'intermediate', 'advanced'] })
    difficulty?: 'basic' | 'intermediate' | 'advanced';

    @ApiProperty({
        required: false,
        enum: ['incremental', 'full', 'graph-only', 'embedding-only'],
    })
    reindexMode?: 'incremental' | 'full' | 'graph-only' | 'embedding-only';

    @ApiProperty({ required: false })
    licenseTag?: string;

    @ApiProperty({ required: false })
    dryRun?: boolean;

    @ApiProperty({ required: false })
    triggeredBy?: string;
}

export const TutorKnowledgeUploadSchema = z.object({
    folderId: z.string().optional(),
    folderName: z.string().optional(),
    folderDescription: z.string().optional(),
    description: z.string().optional(),
    courseCode: z.string().optional(),
    language: z.string().optional(),
    topic: z.string().optional(),
    difficulty: z.enum(['basic', 'intermediate', 'advanced']).optional(),
});

export class TutorKnowledgeUploadDto extends createZodDto(TutorKnowledgeUploadSchema) {
    @ApiProperty({ required: false })
    folderId?: string;

    @ApiProperty({ required: false })
    folderName?: string;

    @ApiProperty({ required: false })
    folderDescription?: string;

    @ApiProperty({ required: false })
    description?: string;

    @ApiProperty({ required: false })
    courseCode?: string;

    @ApiProperty({ required: false })
    language?: string;

    @ApiProperty({ required: false })
    topic?: string;

    @ApiProperty({ required: false, enum: ['basic', 'intermediate', 'advanced'] })
    difficulty?: 'basic' | 'intermediate' | 'advanced';
}

export const TutorKnowledgeFolderSchema = z.object({
    folderId: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    icon: z.string(),
});

export class TutorKnowledgeFolderDto extends createZodDto(TutorKnowledgeFolderSchema) {
    @ApiProperty({ required: false })
    folderId?: string;

    @ApiProperty()
    name: string;

    @ApiProperty({ required: false })
    description?: string;

    @ApiProperty()
    icon: string;
}
