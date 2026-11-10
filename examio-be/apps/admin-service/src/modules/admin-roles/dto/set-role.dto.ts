import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const ReasonSchema = z.string().trim().max(500).optional();

/** Only STUDENT / TEACHER: SYSTEM_ADMIN is a flag with its own endpoint. */
export const SetRoleSchema = z
    .object({ role: z.enum(['STUDENT', 'TEACHER']), reason: ReasonSchema })
    .strict();

export class SetRoleDto extends createZodDto(SetRoleSchema) {}
