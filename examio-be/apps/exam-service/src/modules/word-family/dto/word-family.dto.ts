import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ==================== Request Schemas ====================

export const GenerateWordFamilySchema = z.object({
    categorySlug: z.string().min(1, 'categorySlug không được để trống'),
    numRootWords: z.number().int().min(1).max(20).optional().default(10),
    excludeRootWords: z.array(z.string()).optional().default([]),
});

export const GenerateRootWordFamilySchema = z.object({
    categorySlug: z.string().min(1, 'categorySlug không được để trống'),
    rootWord: z.string().min(1, 'rootWord không được để trống').max(50),
});

export const SaveWordFamilySchema = z.object({
    wordFamilyId: z.string().min(1, 'wordFamilyId không được để trống'),
});

export const ToFlashcardSchema = z.object({
    selectedIndices: z.array(z.number().int().min(0)).optional(),
});

// ==================== DTOs (Zod + Swagger) ====================

export class GenerateWordFamilyDto extends createZodDto(GenerateWordFamilySchema) {
    @ApiProperty({ description: 'Category slug', example: 'shopping-restaurant' })
    categorySlug: string;

    @ApiPropertyOptional({ description: 'Number of root words', example: 10, default: 10 })
    numRootWords: number;

    @ApiPropertyOptional({ description: 'Root words to exclude' })
    excludeRootWords: string[];
}

export class GenerateRootWordFamilyDto extends createZodDto(GenerateRootWordFamilySchema) {
    @ApiProperty({ description: 'Category slug', example: 'shopping-restaurant' })
    categorySlug: string;

    @ApiProperty({ description: 'Từ gốc cụ thể cần sinh từ con', example: 'order' })
    rootWord: string;
}

export class SaveWordFamilyDto extends createZodDto(SaveWordFamilySchema) {
    @ApiProperty({ description: 'Word family DB id' })
    wordFamilyId: string;
}

export class ToFlashcardDto extends createZodDto(ToFlashcardSchema) {
    @ApiPropertyOptional({ description: 'Selected word indices to convert (empty = all)' })
    selectedIndices?: number[];
}
