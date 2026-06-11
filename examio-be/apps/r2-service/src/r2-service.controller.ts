import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Headers,
    Logger,
    Post,
    UploadedFile,
    UnauthorizedException,
    UseInterceptors,
} from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { FileInterceptor } from '@nestjs/platform-express';
import { R2ServiceService } from './r2-service.service';

// gRPC DTOs matching the proto file
interface UploadFileRequest {
    user_id: string;
    filename: string;
    mimetype: string;
    content: Buffer;
    folder?: string;
}

interface GetFileUrlRequest {
    key_r2: string;
    expires_in_seconds?: number;
}

interface DeleteFileRequest {
    key_r2: string;
}

@Controller()
export class R2ServiceController {
    private readonly logger = new Logger(R2ServiceController.name);

    constructor(private readonly r2Service: R2ServiceService) {}

    @Get('health')
    health() {
        return { status: 'ok', service: 'r2-service' };
    }

    @Post('internal/upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadFileHttp(
        @Headers('x-internal-service-token') internalToken: string | undefined,
        @UploadedFile() file: Express.Multer.File,
        @Body('folder') folder?: string
    ) {
        this.assertInternalToken(internalToken);
        this.validateUploadedFile(file);

        const key = await this.r2Service.uploadFile(
            file.originalname,
            file.buffer,
            file.mimetype,
            folder
        );

        return {
            success: true,
            file_id: key,
            url: this.r2Service.getPublicUrl(key),
            key_r2: key,
            message: 'File uploaded successfully',
        };
    }

    private assertInternalToken(token?: string): void {
        const expected = process.env.INTERNAL_SERVICE_TOKEN;
        if (!expected || !token || token !== expected) {
            throw new UnauthorizedException('Invalid internal service token');
        }
    }

    private validateUploadedFile(file?: Express.Multer.File): asserts file is Express.Multer.File {
        if (!file) {
            throw new BadRequestException('File is required');
        }

        const maxFileSizeBytes = Number(process.env.R2_MAX_UPLOAD_BYTES || 10 * 1024 * 1024);
        if (!Number.isFinite(maxFileSizeBytes) || file.size > maxFileSizeBytes) {
            throw new BadRequestException('File is too large');
        }

        if (!file.mimetype || /[
]/.test(file.mimetype)) {
            throw new BadRequestException('Invalid file type');
        }
    }

    @GrpcMethod('R2Service', 'UploadFile')
    async uploadFile(data: UploadFileRequest) {
        this.logger.log(
            `UploadFile request: filename=${data.filename}, mimetype=${data.mimetype}, folder=${data.folder}, contentSize=${data.content?.length || 0}`
        );

        try {
            const key = await this.r2Service.uploadFile(
                data.filename,
                Buffer.from(data.content),
                data.mimetype,
                data.folder
            );

            this.logger.log(`UploadFile success: key=${key}`);

            return {
                success: true,
                file_id: key,
                url: this.r2Service.getPublicUrl(key),
                key_r2: key,
                message: 'File uploaded successfully',
            };
        } catch (error) {
            this.logger.error(
                `UploadFile failed: ${error.message}`,
                error.stack
            );
            return {
                success: false,
                message: `Upload failed: ${error.message}`,
            };
        }
    }

    private assertInternalToken(token?: string): void {
        const expected = process.env.INTERNAL_SERVICE_TOKEN;
        if (!expected || !token || token !== expected) {
            throw new UnauthorizedException('Invalid internal service token');
        }
    }

    private validateUploadedFile(file?: Express.Multer.File): asserts file is Express.Multer.File {
        if (!file) {
            throw new BadRequestException('File is required');
        }

        const maxFileSizeBytes = Number(process.env.R2_MAX_UPLOAD_BYTES || 10 * 1024 * 1024);
        if (!Number.isFinite(maxFileSizeBytes) || file.size > maxFileSizeBytes) {
            throw new BadRequestException('File is too large');
        }

        if (!file.mimetype || /[
]/.test(file.mimetype)) {
            throw new BadRequestException('Invalid file type');
        }
    }

    @GrpcMethod('R2Service', 'GetFileUrl')
    async getFileUrl(data: GetFileUrlRequest) {
        const url = this.r2Service.getPublicUrl(data.key_r2);
        return {
            url,
            expires_at: Date.now() + (data.expires_in_seconds || 3600) * 1000,
        };
    }

    private assertInternalToken(token?: string): void {
        const expected = process.env.INTERNAL_SERVICE_TOKEN;
        if (!expected || !token || token !== expected) {
            throw new UnauthorizedException('Invalid internal service token');
        }
    }

    private validateUploadedFile(file?: Express.Multer.File): asserts file is Express.Multer.File {
        if (!file) {
            throw new BadRequestException('File is required');
        }

        const maxFileSizeBytes = Number(process.env.R2_MAX_UPLOAD_BYTES || 10 * 1024 * 1024);
        if (!Number.isFinite(maxFileSizeBytes) || file.size > maxFileSizeBytes) {
            throw new BadRequestException('File is too large');
        }

        if (!file.mimetype || /[
]/.test(file.mimetype)) {
            throw new BadRequestException('Invalid file type');
        }
    }

    @GrpcMethod('R2Service', 'DeleteFile')
    async deleteFile(data: DeleteFileRequest) {
        try {
            await this.r2Service.deleteFile(data.key_r2);
            return {
                success: true,
                message: 'File deleted successfully',
            };
        } catch (error) {
            return {
                success: false,
                message: `Delete failed: ${error.message}`,
            };
        }
    }
}
