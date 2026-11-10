import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ApiProperty } from '@nestjs/swagger';

/** Body cho `PATCH /admin/page-config/:key`. */
export const TogglePageBodySchema = z
    .object({
        enabled: z.boolean(),
    })
    .strict();

export type TogglePageBody = z.infer<typeof TogglePageBodySchema>;

export class TogglePageBodyDto extends createZodDto(TogglePageBodySchema) {
    @ApiProperty({ description: 'Bật (true) hoặc tắt (false) trang', example: false })
    enabled: boolean;
}
