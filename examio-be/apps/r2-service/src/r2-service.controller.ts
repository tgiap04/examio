import {
    BadRequestException,
    Body,
    Controller,
    Headers,
    Logger,
    Post,
    UploadedFile,
    UnauthorizedException,
    UseInterceptors,
} from '@nestjs/common';
import { Metadata, status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { FileInterceptor } from '@nestjs/platform-express';
import { timingSafeEqual } from 'crypto';
import { r2V1 } from '@examio/contracts';
import { R2ServiceService } from './r2-service.service';
import { Public, RequirePermissionsOrService, ServiceOnly, assertSelfOrService } from '@examio/auth-jwt';

const MAX_DELETE_KEYS = 10_000;

@Controller()
@r2V1.R2ServiceControllerMethods()
export class R2ServiceController implements r2V1.R2ServiceController {
    private readonly logger = new Logger(R2ServiceController.name);

    constructor(private readonly r2Service: R2ServiceService) {}

    @Post('internal/upload')
    @UseInterceptors(FileInterceptor('file'))
    @Public()
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
            url: await this.r2Service.resolveUrl(key),
            key_r2: key,
            message: 'File uploaded successfully',
        };
    }

    private assertInternalToken(token?: string): void {
        const expected = process.env.INTERNAL_SERVICE_TOKEN;
        if (!expected || !token) {
            throw new UnauthorizedException('Invalid internal service token');
        }
        // Constant-time comparison to avoid leaking the token via timing.
        const expectedBuf = Buffer.from(expected);
        const tokenBuf = Buffer.from(token);
        if (
            expectedBuf.length !== tokenBuf.length ||
            !timingSafeEqual(expectedBuf, tokenBuf)
        ) {
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

        if (!file.mimetype || /[<>\"'\\n]/.test(file.mimetype)) {
            throw new BadRequestException('Invalid file type');
        }
    }

    @ServiceOnly('exam', 'auth')
    async uploadFile(
        data: r2V1.UploadFileRequest
    ): Promise<r2V1.UploadFileResponse> {
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
                fileId: key,
                url: await this.r2Service.resolveUrl(key),
                keyR2: key,
                message: 'File uploaded successfully',
            };
        } catch (error) {
            this.logger.error(
                `UploadFile failed: ${error.message}`,
                error.stack
            );
            return {
                success: false,
                fileId: '',
                url: '',
                keyR2: '',
                message: `Upload failed: ${error.message}`,
            };
        }
    }

    // Keyed by a storage key (a capability, not owned by a user id) and nobody
    // but the internal services that wrote the key needs it: service-only.
    @ServiceOnly('exam', 'auth')
    async getFileUrl(
        data: r2V1.GetFileUrlRequest
    ): Promise<r2V1.GetFileUrlResponse> {
        const expiresIn = data.expiresInSeconds || 3600;
        const url = await this.r2Service.resolveUrl(data.keyR2, expiresIn);
        return {
            url,
            expiresAt: String(Date.now() + expiresIn * 1000),
        };
    }

    @ServiceOnly('exam', 'auth')
    async deleteFile(
        data: r2V1.DeleteFileRequest
    ): Promise<r2V1.DeleteFileResponse> {
        try {
            await this.r2Service.deleteFile(data.keyR2);
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

    @RequirePermissionsOrService([])
    listUserFiles(data: r2V1.ListUserFilesRequest, metadata: Metadata): never {
        // A user token may only name itself; allowlisted services any user.
        assertSelfOrService(metadata, data.userId);
        throw new RpcException({
            code: status.UNIMPLEMENTED,
            message: 'ListUserFiles is not implemented',
        });
    }

    @ServiceOnly('exam', 'auth')
    async deleteObjects(
        data: r2V1.DeleteObjectsRequest
    ): Promise<r2V1.DeleteObjectsResponse> {
        const keys = [...new Set(data.keys)];
        if (keys.length > MAX_DELETE_KEYS) {
            throw new RpcException({
                code: status.INVALID_ARGUMENT,
                message: `At most ${MAX_DELETE_KEYS} keys per call`,
            });
        }
        if (keys.some((key) => !key.trim())) {
            throw new RpcException({
                code: status.INVALID_ARGUMENT,
                message: 'Keys must be non-empty',
            });
        }
        try {
            return await this.r2Service.deleteObjects(keys);
        } catch (error) {
            this.logger.error(`DeleteObjects failed: ${error.message}`);
            throw new RpcException({
                code: status.INTERNAL,
                message: 'DeleteObjects failed',
            });
        }
    }
}
