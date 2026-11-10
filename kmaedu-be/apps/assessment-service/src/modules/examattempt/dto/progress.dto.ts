import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const UpdateProgressSchema = z.object({
    answers: z.record(z.string(), z.string()).optional(),
    currentIndex: z.number().int().min(0).optional(),
    markedQuestions: z.array(z.string()).optional(),
});
export class UpdateProgressDto extends createZodDto(UpdateProgressSchema) {}

export const SecureSubmitSchema = z.object({
    answers: z.array(
        z.object({ token: z.string().min(1), chosen_option: z.string() })
    ),
});
export class SecureSubmitDto extends createZodDto(SecureSubmitSchema) {}
