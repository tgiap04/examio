import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const ToFlashcardSchema = z.object({
    selectedIndices: z.array(z.number().int().min(0)).optional(),
});

export class ToFlashcardDto extends createZodDto(ToFlashcardSchema) {
    @ApiPropertyOptional({ description: 'Selected word indices to convert (empty = all)' })
    selectedIndices?: number[];
}
