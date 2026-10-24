import {
    BadRequestException,
    Controller,
    Post,
    Req,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '@examio/common';
import { RequirePermissions } from '@examio/auth-jwt';
import { MAX_IMAGE_BYTES, MAX_UPLOAD_BYTES } from '../../config/document.constants';
import { ImageUploadService } from './image-upload.service';

const MB = 1024 * 1024;

/** `POST /r2/image`, moved from exam-service: a public image (max 2 MB) under `images/<userId>/`. */
@ApiTags('R2')
@Controller('r2')
export class R2ImageController {
    constructor(private readonly images: ImageUploadService) {}

    @Post('image')
    @RequirePermissions('document:upload')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
    @ApiCookieAuth('cookie-auth')
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Upload image to R2 storage' })
    async uploadImage(@Req() req: AuthenticatedRequest, @UploadedFile() file: Express.Multer.File) {
        if (!file || !file.buffer) throw new BadRequestException('No file uploaded');
        if (!file.mimetype.startsWith('image/')) throw new BadRequestException('Only image files are allowed');
        if (file.size > MAX_IMAGE_BYTES) {
            throw new BadRequestException(
                `File too large. Maximum size is 2MB, got ${(file.size / MB).toFixed(2)}MB`
            );
        }
        const { url } = await this.images.upload(file, req.user.id);
        return { url };
    }
}
