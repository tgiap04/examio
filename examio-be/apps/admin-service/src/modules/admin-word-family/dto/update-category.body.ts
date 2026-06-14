import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const UpdateCategoryBodySchema = z
    .object({
        name: z
            .string()
            .min(1, { message: 'name must not be empty' })
            .max(100, { message: 'name must not exceed 100 characters' })
            .optional(),
        description: z
            .string()
            .max(500, { message: 'description must not exceed 500 characters' })
            .optional(),
        imageUrl: z.string().url({ message: 'imageUrl must be a valid URL' }).optional(),
        order: z
            .number()
            .int({ message: 'order must be an integer' })
            .min(0, { message: 'order must be >= 0' })
            .optional(),
        isActive: z.boolean().optional(),
    })
    .strict();

export type UpdateCategoryBody = z.infer<typeof UpdateCategoryBodySchema>;

export class UpdateCategoryBodyDto extends createZodDto(UpdateCategoryBodySchema) {
    @ApiPropertyOptional()
    name?: string;

    @ApiPropertyOptional()
    description?: string;

    @ApiPropertyOptional()
    imageUrl?: string;

    @ApiPropertyOptional({ minimum: 0 })
    order?: number;

    @ApiPropertyOptional()
    isActive?: boolean;
}
