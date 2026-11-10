import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

/** `{ cardId }` adds one studied card, `{ studiedCardIds }` replaces the list. */
export const SaveProgressSchema = z.object({
    studiedCardIds: z.array(z.string()).optional(),
    cardId: z.string().min(1).optional(),
});
export class SaveProgressDto extends createZodDto(SaveProgressSchema) {}
