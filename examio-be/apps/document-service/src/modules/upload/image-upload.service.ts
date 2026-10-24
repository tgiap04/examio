import { Injectable, Logger } from '@nestjs/common';
import { sanitizeFilename } from '@examio/common';
import { R2Client } from '../../clients/r2.client';

@Injectable()
export class ImageUploadService {
    private readonly logger = new Logger(ImageUploadService.name);

    constructor(private readonly r2: R2Client) {}

    /** Stores an image under `images/<userId>` and returns its public URL and key. */
    async upload(file: Express.Multer.File, userId: string): Promise<{ url: string; keyR2: string }> {
        const filename = `${Date.now()}-${sanitizeFilename(file.originalname)}`;
        const keyR2 = await this.r2.uploadFile(filename, file.buffer, file.mimetype, `images/${userId}`);
        const url = this.r2.getPublicUrl(keyR2);
        this.logger.log(`Image uploaded: ${keyR2}`);
        return { url, keyR2 };
    }
}
