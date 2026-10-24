import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { MAX_UPLOAD_BYTES } from '../../../config/document.constants';

/** Body of `POST /ai/upload`: an object the client already stored in R2 under its own key. */
export const RegisterUploadSchema = z.object({
    filename: z.string().trim().min(1).max(255),
    url: z.string().min(1).max(2048),
    mimetype: z.string().trim().min(1).max(255),
    size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
    keyR2: z.string().min(1).max(1024),
});
export class RegisterUploadDto extends createZodDto(RegisterUploadSchema) {}

/** Body of the `POST /ai/upload-image` placeholder (unchanged from exam-service). */
export const UploadImageSchema = z.object({
    image: z.string(),
    filename: z.string().optional(),
});
export class UploadImageDto extends createZodDto(UploadImageSchema) {}
