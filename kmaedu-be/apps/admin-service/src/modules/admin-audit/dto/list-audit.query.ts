import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ApiProperty } from '@nestjs/swagger';

const BooleanEnum = z.enum(['true', 'false']).transform((v) => v === 'true');

/**
 * Zod schema for `GET /admin/audit` query string.
 *
 * Filters audit metadata by admin, target, action and time window.
 * Audit rows are metadata only (no `password`-shaped fields) so a
 * full `select` is safe.
 */
export const ListAuditQuerySchema = z
    .object({
        adminId: z.string().min(1).optional(),
        targetId: z.string().min(1).optional(),
        action: z.string().min(1).max(120).optional(),
        createdFrom: z
            .string()
            .datetime({ message: 'createdFrom must be an ISO timestamp' })
            .optional(),
        createdTo: z
            .string()
            .datetime({ message: 'createdTo must be an ISO timestamp' })
            .optional(),
        page: z
            .string()
            .optional()
            .transform((v) => (v === undefined ? 1 : Number(v)))
            .refine((v) => Number.isInteger(v) && v >= 1, {
                message: 'page must be an integer >= 1',
            }),
        pageSize: z
            .string()
            .optional()
            .transform((v) => (v === undefined ? 20 : Number(v)))
            .refine((v) => Number.isInteger(v) && v >= 1 && v <= 100, {
                message: 'pageSize must be an integer between 1 and 100',
            }),
    })
    .strict();

export type ListAuditQuery = z.infer<typeof ListAuditQuerySchema>;

export class ListAuditQueryDto extends createZodDto(ListAuditQuerySchema) {
    @ApiProperty({ required: false })
    adminId?: string;

    @ApiProperty({ required: false })
    targetId?: string;

    @ApiProperty({ required: false, maxLength: 120 })
    action?: string;

    @ApiProperty({ required: false, example: '2026-01-01T00:00:00.000Z' })
    createdFrom?: string;

    @ApiProperty({ required: false, example: '2026-12-31T23:59:59.999Z' })
    createdTo?: string;

    @ApiProperty({ required: false, default: 1, minimum: 1 })
    page: number;

    @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 100 })
    pageSize: number;
}
