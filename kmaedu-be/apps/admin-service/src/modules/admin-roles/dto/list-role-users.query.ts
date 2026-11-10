import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const BooleanEnum = z.enum(['true', 'false']).transform((v) => v === 'true');
const intIn = (min: number, max: number, fallback: number) =>
    z
        .string()
        .optional()
        .transform((v) => (v === undefined ? fallback : Number(v)))
        .refine((v) => Number.isInteger(v) && v >= min && v <= max, {
            message: `must be an integer between ${min} and ${max}`,
        });

/** `GET /admin/roles/users`. */
export const ListRoleUsersQuerySchema = z
    .object({
        q: z.string().trim().max(100).optional(),
        role: z.enum(['STUDENT', 'TEACHER']).optional(),
        isSystemAdmin: BooleanEnum.optional(),
        page: intIn(1, 1_000_000, 1),
        limit: intIn(1, 100, 20),
    })
    .strict();

export class ListRoleUsersQueryDto extends createZodDto(ListRoleUsersQuerySchema) {}

/** `GET /admin/roles/changes`. */
export const ListRoleChangesQuerySchema = z
    .object({
        userId: z.string().trim().min(1).max(64).optional(),
        page: intIn(1, 1_000_000, 1),
        limit: intIn(1, 100, 20),
    })
    .strict();

export class ListRoleChangesQueryDto extends createZodDto(ListRoleChangesQuerySchema) {}
