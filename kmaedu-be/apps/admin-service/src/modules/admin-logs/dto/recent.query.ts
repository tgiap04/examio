import { z } from 'zod';

export const RecentQuerySchema = z.object({
    service: z.enum(['auth', 'gateway']),
    limit: z.coerce.number().int().min(1).max(1000).default(100),
});

export type RecentQuery = z.infer<typeof RecentQuerySchema>;
