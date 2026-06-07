import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const SUBSCRIPTION_TIER = {
    NONE: 0,
    BASIC: 1,
    ADVANCED: 2,
    VIP: 3,
} as const;

export const SetTierBodySchema = z.object({
    userId: z
        .string({ error: 'userId is required' })
        .min(1, { message: 'userId is required' }),
    tier: z
        .number({ error: 'tier is required' })
        .int({ message: 'tier must be an integer' })
        .refine(
            (v) => v === 0 || v === 1 || v === 2 || v === 3,
            { message: 'tier must be one of 0, 1, 2, 3' }
        ),
    billingCycle: z.enum(['monthly', 'yearly']).optional(),
    reason: z
        .string({ error: 'reason is required' })
        .min(10, { message: 'Reason must be at least 10 characters' })
        .max(500, { message: 'Reason must be at most 500 characters' }),
});

export type SetTierBody = z.infer<typeof SetTierBodySchema>;

export class SetTierBodyDto extends createZodDto(SetTierBodySchema) {}
