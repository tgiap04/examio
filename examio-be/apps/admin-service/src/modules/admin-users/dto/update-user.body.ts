import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Zod schema for `PATCH /admin/users/:id` body.
 *
 * All fields are optional. The service diffs the incoming payload
 * against the persisted record and writes one audit row per changed
 * field.
 *
 * `isSystemAdmin` is deliberately NOT patchable: admin privilege changes go
 * through auth `SetSystemAdmin` (grant-admin / revoke-admin endpoints) so the
 * last-admin guard, audit log and authzVersion bump cannot be bypassed.
 * The schema is `.strict()`, so sending it is a 400.
 */
export const UpdateUserBodySchema = z
    .object({
        isVerified: z.boolean().optional(),
        isBanned: z.boolean().optional(),
        name: z.string().min(1).max(100).optional(),
        bio: z.string().max(500).optional(),
    })
    .strict();

export type UpdateUserBody = z.infer<typeof UpdateUserBodySchema>;

export class UpdateUserBodyDto extends createZodDto(UpdateUserBodySchema) {
    @ApiProperty({ required: false })
    isVerified?: boolean;

    @ApiProperty({ required: false })
    isBanned?: boolean;

    @ApiProperty({ required: false, maxLength: 100 })
    name?: string;

    @ApiProperty({ required: false, maxLength: 500 })
    bio?: string;
}
