import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const WALLET_DIRECTION = {
    ADD: 'ADD',
    SUBTRACT: 'SUBTRACT',
} as const;

export const CreditBodySchema = z.object({
    userId: z
        .string({ required_error: 'userId is required' })
        .min(1, { message: 'userId is required' }),
    amount: z
        .number({ required_error: 'amount is required' })
        .positive({ message: 'Amount must be a positive number' }),
    direction: z.enum(['ADD', 'SUBTRACT'], {
        errorMap: () => ({ message: 'direction must be ADD or SUBTRACT' }),
    }),
    reason: z
        .string({ required_error: 'reason is required' })
        .min(10, { message: 'Reason must be at least 10 characters' })
        .max(500, { message: 'Reason must be at most 500 characters' }),
});

export type CreditBody = z.infer<typeof CreditBodySchema>;

export class CreditBodyDto extends createZodDto(CreditBodySchema) {}
