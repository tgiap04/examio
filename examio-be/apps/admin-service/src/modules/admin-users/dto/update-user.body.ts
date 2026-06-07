import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Zod schema for `PATCH /admin/users/:id` body.
 *
 * All fields are optional. The service diffs the incoming payload
 * against the persisted record and writes one audit row per changed
 * field.
 */
export const UpdateUserBodySchema = z
    .object({
        isAdmin: z.boolean().optional(),
        isVerified: z.boolean().optional(),
        isBanned: z.boolean().optional(),
        name: z.string().min(1).max(100).optional(),
        bio: z.string().max(500).optional(),
    })
    .strict();

export type UpdateUserBody = z.infer<typeof UpdateUserBodySchema>;

export class UpdateUserBodyDto extends createZodDto(UpdateUserBodySchema) {
    @ApiProperty({ required: false })
    isAdmin?: boolean;

    @ApiProperty({ required: false })
    isVerified?: boolean;

    @ApiProperty({ required: false })
    isBanned?: boolean;

    @ApiProperty({ required: false, maxLength: 100 })
    name?: string;

    @ApiProperty({ required: false, maxLength: 500 })
    bio?: string;
}
