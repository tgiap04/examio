import { BadRequestException } from '@nestjs/common';
import { createZodValidationPipe } from 'nestjs-zod';

/** Shared by the admin controllers that return the role-route envelope: same as ZodValidationPipe, but the 400 carries `code: VALIDATION_ERROR` (the FE keys on it). */
export const AdminValidationPipe = createZodValidationPipe({
    createValidationException: (error) =>
        new BadRequestException({
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '),
        }),
});
