import { z } from 'zod';
import { queryBool, queryInt, queryStringArray } from '../../common/query-schema';
import { createZodDto } from 'nestjs-zod';
import { ApiProperty } from '@nestjs/swagger';

export const GetFlashcardsetsSchema = z.object({
    page: queryInt(1).default(1),
    limit: queryInt(1, 100).default(10),
    search: z.string().optional(),
    tag: queryStringArray.optional(),
    isPublic: queryBool.optional(),
    isPinned: queryBool.optional(),
});

export class GetFlashcardsetsDto extends createZodDto(GetFlashcardsetsSchema) {
    @ApiProperty({
        description: 'Page number for pagination',
        example: 1,
        required: false,
    })
    page: number;

    @ApiProperty({
        description: 'Number of items per page for pagination',
        example: 10,
        required: false,
    })
    limit: number;

    @ApiProperty({
        description:
            'Search term to filter flashcard sets by title or description',
        example: 'vocabulary',
        required: false,
    })
    search?: string;

    @ApiProperty({
        description: 'Tags to filter flashcard sets',
        example: ['english', 'vocabulary'],
        required: false,
        type: [String],
    })
    tag?: string[];

    @ApiProperty({
        description: 'Filter for public flashcard sets',
        example: true,
        required: false,
    })
    isPublic?: boolean;

    @ApiProperty({
        description: 'Filter for pinned flashcard sets',
        example: false,
        required: false,
    })
    isPinned?: boolean;
}
