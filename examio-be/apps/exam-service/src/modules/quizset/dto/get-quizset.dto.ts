import { z } from 'zod';
import { queryBool, queryInt, queryStringArray } from '../../common/query-schema';
import { createZodDto } from 'nestjs-zod';
import { ApiProperty } from '@nestjs/swagger';

export const GetQuizsetsSchema = z.object({
    page: queryInt(1).default(1),
    limit: queryInt(1, 100).default(10),
    search: z.string().optional(),
    tags: queryStringArray.optional(),
    isPublic: queryBool.optional(),
    isPinned: queryBool.optional(),
});

export class GetQuizsetsDto extends createZodDto(GetQuizsetsSchema) {
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
        description: 'Search term to filter quiz sets by title or description',
        example: 'math',
        required: false,
    })
    search?: string;

    @ApiProperty({
        description: 'Tags to filter quiz sets',
        example: ['math', 'algebra'],
        required: false,
        type: [String],
    })
    tags?: string[];

    @ApiProperty({
        description: 'Filter for public quiz sets',
        example: true,
        required: false,
    })
    isPublic?: boolean;

    @ApiProperty({
        description: 'Filter for pinned quiz sets',
        example: false,
        required: false,
    })
    isPinned?: boolean;
}
