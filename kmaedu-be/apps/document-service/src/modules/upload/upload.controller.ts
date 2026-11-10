import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Logger,
    Param,
    Post,
    Req,
    UploadedFile,
    UseInterceptors,
    UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuthenticatedRequest } from '@kmaedu/common';
import { RequirePermissions } from '@kmaedu/auth-jwt';
import { MAX_QUICK_UPLOAD_BYTES, MAX_UPLOAD_BYTES } from '../../config/document.constants';
import { toHttpDocument } from './document-mapper';
import { DocumentErrorCode, documentError } from './document-errors';
import { DocumentDeleteService } from './document-delete.service';
import { DocumentQueryService } from './document-query.service';
import { DocumentRegisterService } from './document-register.service';
import { DocumentUploadService } from './document-upload.service';
import { RegisterUploadDto, UploadImageDto } from './dto/upload.dto';

const MB = 1024 * 1024;

/** `/ai/*` upload routes moved verbatim from the old exam service (paths and response shapes unchanged). */
@UsePipes(ZodValidationPipe)
@ApiTags('AI')
@Controller('ai')
export class UploadController {
    private readonly logger = new Logger(UploadController.name);

    constructor(
        private readonly uploads: DocumentUploadService,
        private readonly registrations: DocumentRegisterService,
        private readonly queries: DocumentQueryService,
        private readonly deletes: DocumentDeleteService
    ) {}

    @Post('quick-upload')
    @RequirePermissions('document:upload')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
    @ApiCookieAuth('cookie-auth')
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Quick upload file cho AI Teacher (khong OCR ngay)' })
    async quickUpload(@Req() req: AuthenticatedRequest, @UploadedFile() file: Express.Multer.File) {
        if (!file || !file.buffer) throw new BadRequestException('No file uploaded');
        if (file.size > MAX_QUICK_UPLOAD_BYTES) {
            throw new BadRequestException(
                `File quá lớn. Tối đa 5MB, file của bạn: ${(file.size / MB).toFixed(2)}MB`
            );
        }
        this.logger.log(`quick-upload user=${req.user.id} ${file.originalname} (${file.size} bytes)`);
        return this.uploads.quick(req.user.id, {
            filename: file.originalname,
            mimetype: file.mimetype,
            data: file.buffer,
        });
    }

    @Get('upload/:uploadId')
    @RequirePermissions('document:upload')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Lấy chi tiết file đã upload' })
    @ApiParam({ name: 'uploadId', description: 'ID của upload' })
    async uploadDetail(@Req() req: AuthenticatedRequest, @Param('uploadId') uploadId: string) {
        return toHttpDocument(await this.queries.getOwned(req.user.id, uploadId));
    }

    @Delete('upload/:uploadId')
    @RequirePermissions('document:upload')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Xóa file upload' })
    @ApiParam({ name: 'uploadId', description: 'ID của upload' })
    async deleteUpload(@Req() req: AuthenticatedRequest, @Param('uploadId') uploadId: string) {
        const { deleted } = await this.deletes.deleteOwned(req.user.id, [uploadId]);
        if (deleted.length === 0) throw documentError(404, DocumentErrorCode.NOT_FOUND, 'Upload không tồn tại');
        return { success: true, message: 'Xóa thành công' };
    }

    @Post('upload')
    @RequirePermissions('document:upload')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Đăng ký upload (queue OCR)' })
    async createUpload(@Req() req: AuthenticatedRequest, @Body() dto: RegisterUploadDto) {
        return this.registrations.register(req.user.id, dto);
    }

    @Post('upload-image')
    @RequirePermissions('document:upload')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Upload image cho AI chat (placeholder, như trước đây)' })
    async uploadImage(@Body() _dto: UploadImageDto) {
        return { success: true, message: 'Image upload endpoint - implementation pending' };
    }
}
