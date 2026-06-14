import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CreateCategoryBodySchema = z
    .object({
        name: z
            .string({ required_error: 'name is required' })
            .min(1, { message: 'name must not be empty' })
            .max(100, { message: 'name must not exceed 100 characters' }),
        slug: z
            .string({ required_error: 'slug is required' })
            .min(1, { message: 'slug must not be empty' })
            .regex(/^[a-z0-9-]+$/, {
                message: 'slug must contain only lowercase letters, digits, and hyphens',
            }),
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
    })
    .strict();

export type CreateCategoryBody = z.infer<typeof CreateCategoryBodySchema>;

export class CreateCategoryBodyDto extends createZodDto(CreateCategoryBodySchema) {
    @ApiProperty({ example: 'Mua sắm, nhà hàng' })
    name: string;

    @ApiProperty({ example: 'shopping-restaurant' })
    slug: string;

    @ApiPropertyOptional()
    description?: string;

    @ApiPropertyOptional()
    imageUrl?: string;

    @ApiPropertyOptional({ minimum: 0 })
    order?: number;
}
