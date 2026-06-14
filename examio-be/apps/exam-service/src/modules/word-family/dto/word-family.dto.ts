import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ==================== Request Schemas ====================

export const GenerateWordFamilySchema = z.object({
    categorySlug: z.string().min(1, 'categorySlug không được để trống'),
    numRootWords: z.number().int().min(1).max(20).optional().default(10),
    excludeRootWords: z.array(z.string()).optional().default([]),
});

export const SaveWordFamilySchema = z.object({
    wordFamilyId: z.string().min(1, 'wordFamilyId không được để trống'),
});

export const ToFlashcardSchema = z.object({
    selectedIndices: z.array(z.number().int().min(0)).optional(),
});

export const CreateCategorySchema = z.object({
    name: z.string().min(1, 'Tên danh mục không được để trống').max(100),
    slug: z.string().min(1, 'Slug không được để trống').regex(
        /^[a-z0-9-]+$/,
        'Slug chỉ chứa lowercase, số và dấu gạch ngang',
    ),
    description: z.string().optional(),
    imageUrl: z.string().url().optional(),
    order: z.number().int().min(0).optional(),
});

export const UpdateCategorySchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    imageUrl: z.string().url().optional(),
    order: z.number().int().min(0).optional(),
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

export class SaveWordFamilyDto extends createZodDto(SaveWordFamilySchema) {
    @ApiProperty({ description: 'Word family DB id' })
    wordFamilyId: string;
}

export class ToFlashcardDto extends createZodDto(ToFlashcardSchema) {
    @ApiPropertyOptional({ description: 'Selected word indices to convert (empty = all)' })
    selectedIndices?: number[];
}

export class CreateCategoryDto extends createZodDto(CreateCategorySchema) {
    @ApiProperty({ description: 'Category name', example: 'Mua sắm, nhà hàng' })
    name: string;

    @ApiProperty({ description: 'Category slug', example: 'shopping-restaurant' })
    slug: string;

    @ApiPropertyOptional({ description: 'Category description' })
    description?: string;

    @ApiPropertyOptional({ description: 'Thumbnail URL (R2)' })
    imageUrl?: string;

    @ApiPropertyOptional({ description: 'Display order' })
    order?: number;
}

export class UpdateCategoryDto extends createZodDto(UpdateCategorySchema) {
    @ApiPropertyOptional({ description: 'Category name' })
    name?: string;

    @ApiPropertyOptional({ description: 'Category description' })
    description?: string;

    @ApiPropertyOptional({ description: 'Thumbnail URL (R2)' })
    imageUrl?: string;

    @ApiPropertyOptional({ description: 'Display order' })
    order?: number;
}
