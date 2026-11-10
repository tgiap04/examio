import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ReasonSchema } from './set-role.dto';

export const SetSystemAdminSchema = z
    .object({ isSystemAdmin: z.boolean(), reason: ReasonSchema })
    .strict();

export class SetSystemAdminDto extends createZodDto(SetSystemAdminSchema) {}
