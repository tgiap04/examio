import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ApiProperty } from '@nestjs/swagger';

export const SeriesQuerySchema = z.object({
    name: z.enum(['signups', 'traffic']),
    range: z.enum(['7d', '30d', '90d']).default('30d'),
    bucket: z.enum(['day', 'week', 'month']).default('day'),
});

export class SeriesQueryDto extends createZodDto(SeriesQuerySchema) {
    @ApiProperty({
        description: 'Metric name to chart',
        enum: ['signups', 'traffic'],
        example: 'signups',
    })
    name: 'signups' | 'traffic';

    @ApiProperty({
        description: 'Time range',
        enum: ['7d', '30d', '90d'],
        default: '30d',
    })
    range: '7d' | '30d' | '90d';

    @ApiProperty({
        description: 'Bucket size',
        enum: ['day', 'week', 'month'],
        default: 'day',
    })
    bucket: 'day' | 'week' | 'month';
}
