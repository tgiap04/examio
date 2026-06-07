import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const RefundBodySchema = z.object({
    paymentId: z
        .string({ required_error: 'paymentId is required' })
        .min(1, {
            message: 'paymentId is required',
        }),
    reason: z
        .string({ required_error: 'reason is required' })
        .min(10, { message: 'Reason must be at least 10 characters' })
        .max(500, { message: 'Reason must be at most 500 characters' }),
});

export type RefundBody = z.infer<typeof RefundBodySchema>;

export class RefundBodyDto extends createZodDto(RefundBodySchema) {}
