import { Injectable, Logger } from '@nestjs/common';
import { sanitizeFilename } from '@examio/common';
import { R2Client } from '../../clients/r2.client';
import { buildMetadata } from '@examio/grpc';

@Injectable()
export class R2UploadService {
    private readonly logger = new Logger(R2UploadService.name);

    constructor(private readonly r2Client: R2Client) {}

    /**
     * Upload image to R2 storage
     * @param file - Multer file
     * @param userId - User ID (optional, for folder organization)
     * @returns Public URL of the uploaded image
     */
    async uploadImage(
        file: Express.Multer.File,
        userId?: string
    ): Promise<{ url: string; keyR2: string }> {
        this.logger.log(
            `Uploading image: ${file.originalname} (${file.size} bytes)`
        );

        // Generate unique filename with sanitized name for Vietnamese support
        const timestamp = Date.now();
        const sanitizedName = sanitizeFilename(file.originalname);
        const filename = `${timestamp}-${sanitizedName}`;

        // Use 'images' folder for general image uploads
        const folder = userId ? `images/${userId}` : 'images';

        const keyR2 = await this.r2Client.uploadFile(
            filename,
            file.buffer,
            file.mimetype,
            folder,
            buildMetadata()
        );

        const url = this.r2Client.getPublicUrl(keyR2);

        this.logger.log(`Image uploaded: ${keyR2} -> ${url}`);

        return { url, keyR2 };
    }
}
