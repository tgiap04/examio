import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ApiProperty } from '@nestjs/swagger';

const BooleanEnum = z.enum(['true', 'false']).transform((v) => v === 'true');

/**
 * Zod schema for `GET /admin/users` query string.
 *
 * - `search` is capped at 20 chars to limit email/username enumeration.
 * - `isAdmin` / `isVerified` / `isBanned` accept the string form
 *   `true` | `false` (querystring cannot carry booleans natively) and
 *   are coerced into a boolean via the `BooleanEnum` helper.
 * - `createdFrom` / `createdTo` are ISO 8601 timestamps.
 * - `page` is 1-based, `pageSize` defaults to 20 and is capped at 100.
 */
export const ListUsersQuerySchema = z
    .object({
        search: z
            .string()
            .max(20, { message: 'search must not exceed 20 characters' })
            .optional(),
        isAdmin: BooleanEnum.optional(),
        isVerified: BooleanEnum.optional(),
        isBanned: BooleanEnum.optional(),
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

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

export class ListUsersQueryDto extends createZodDto(ListUsersQuerySchema) {
    @ApiProperty({ required: false, maxLength: 20 })
    search?: string;

    @ApiProperty({ required: false, enum: ['true', 'false'] })
    isAdmin?: boolean;

    @ApiProperty({ required: false, enum: ['true', 'false'] })
    isVerified?: boolean;

    @ApiProperty({ required: false, enum: ['true', 'false'] })
    isBanned?: boolean;

    @ApiProperty({ required: false, example: '2026-01-01T00:00:00.000Z' })
    createdFrom?: string;

    @ApiProperty({ required: false, example: '2026-12-31T23:59:59.999Z' })
    createdTo?: string;

    @ApiProperty({ required: false, default: 1, minimum: 1 })
    page: number;

    @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 100 })
    pageSize: number;
}
