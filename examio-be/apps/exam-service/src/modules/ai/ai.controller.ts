import { QueryIntPipe } from '../common/query-schema';
import { ZodValidationPipe } from 'nestjs-zod';
import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    Query,
    Req,
    UseInterceptors,
    UploadedFile,
    Logger,
    BadRequestException,
    NotFoundException,
    UsePipes,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiCookieAuth,
    ApiParam,
    ApiQuery,
    ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthenticatedRequest } from '@examio/common';
import { extractHttpToken, RequirePermissions } from '@examio/auth-jwt';
import { AIService } from './ai.service';
import { GenerationJobService } from './generation-job.service';
import { GenerationQueryService } from './generation-query.service';
import { ModelCatalogService } from './model-catalog.service';
import { MAX_MULTER_FILE_BYTES } from './generation.constants';
import { RegenerateDto, GenerateFromFileDto } from './dto/ai.dto';

const invalidJobId = (jobId: string) => !jobId || jobId === 'undefined' || jobId === 'null';
const INVALID_JOB = { error: 'Invalid job ID', message: 'Job ID không hợp lệ', statusCode: 400 };

/**
 * Generation routes. Uploads (`upload`, `quick-upload`, `upload/:id`, `upload-image`, `r2/image`) are
 * served by document-service now; `recent-uploads` stays here because it joins the documents (gRPC)
 * with the generated history this service owns.
 */
@UsePipes(ZodValidationPipe)
@ApiTags('AI')
@Controller('ai')
export class AIController {
    private readonly logger = new Logger(AIController.name);

    constructor(
        private readonly aiService: AIService,
        private readonly generation: GenerationJobService,
        private readonly queries: GenerationQueryService,
        private readonly models: ModelCatalogService
    ) {}

    @Post('generate-from-file')
    @RequirePermissions('ai:generate')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_MULTER_FILE_BYTES } }))
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Upload file và tạo quiz/flashcard (Teacher only)' })
    @ApiConsumes('multipart/form-data')
    @ApiResponse({ status: 201, description: 'Job đã được tạo' })
    async generateFromFile(
        @Req() req: AuthenticatedRequest,
        @UploadedFile() file: Express.Multer.File,
        @Body() dto: GenerateFromFileDto
    ) {
        this.logger.log(
            `generate-from-file user=${req.user?.id} file=${file ? `${file.originalname} (${file.size} bytes)` : 'MISSING'}`
        );
        if (!file || !file.buffer) throw new BadRequestException('No file uploaded');
        return this.aiService.generateFromFile(req.user, file, dto, extractHttpToken(req));
    }

    @Get('recent-uploads')
    @RequirePermissions('document:upload')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Lấy danh sách file đã upload kèm tóm tắt quiz/flashcard đã tạo' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'size', required: false, type: Number })
    @ApiResponse({ status: 200, description: 'Danh sách uploads' })
    async getRecentUploads(
        @Req() req: AuthenticatedRequest,
        @Query('page', new QueryIntPipe()) page?: number,
        @Query('size', new QueryIntPipe({ max: 100 })) size?: number
    ) {
        return this.queries.getRecentUploads(req.user, page ? Number(page) : 1, size ? Number(size) : 10, extractHttpToken(req));
    }

    @Get('models')
    @RequirePermissions('ai:generate')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Lay catalog model AI cho frontend' })
    @ApiResponse({ status: 200, description: 'Danh sach model AI' })
    async getModels() {
        return this.models.getCatalog();
    }

    @Post('regenerate/:uploadId')
    @RequirePermissions('ai:generate')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Tạo lại quiz/flashcard từ file (Teacher only)' })
    @ApiParam({ name: 'uploadId', description: 'ID của upload' })
    @ApiResponse({ status: 200, description: 'Regenerate request' })
    async regenerate(
        @Req() req: AuthenticatedRequest,
        @Param('uploadId') uploadId: string,
        @Body() dto: RegenerateDto
    ) {
        return this.aiService.regenerate(uploadId, req.user, dto, extractHttpToken(req));
    }

    @Get('job/:jobId')
    @RequirePermissions('ai:generate')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Lấy trạng thái job (Teacher & Student)' })
    @ApiParam({ name: 'jobId', description: 'ID của job' })
    @ApiResponse({ status: 200, description: 'Trạng thái job' })
    async getJobStatus(@Req() req: AuthenticatedRequest, @Param('jobId') jobId: string) {
        if (invalidJobId(jobId)) return INVALID_JOB;
        return this.queries.getJobStatus(jobId, req.user, extractHttpToken(req));
    }

    @Delete('job/:jobId')
    @RequirePermissions('ai:generate')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Hủy job đang xử lý và hoàn tín dụng (Teacher & Student)' })
    @ApiParam({ name: 'jobId', description: 'ID của job' })
    @ApiResponse({ status: 200, description: 'Job đã được hủy' })
    async cancelJob(@Req() req: AuthenticatedRequest, @Param('jobId') jobId: string) {
        if (invalidJobId(jobId)) return INVALID_JOB;
        const job = await this.queries.findJob(jobId, req.user);
        if (!job) throw new NotFoundException('Job không tồn tại');
        await this.generation.cancel(job);
        return { success: true, message: 'Đã hủy tác vụ' };
    }

    @Get('upload/:uploadId/history')
    @RequirePermissions('ai:generate')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Lấy lịch sử quiz và flashcard đã tạo cho một file (Teacher & Student)' })
    @ApiParam({ name: 'uploadId', description: 'ID của UserStorage' })
    @ApiResponse({ status: 200, description: 'Lịch sử quiz và flashcard' })
    async getUploadHistory(@Req() req: AuthenticatedRequest, @Param('uploadId') uploadId: string) {
        return this.queries.getUploadHistory(uploadId, req.user, extractHttpToken(req));
    }
}
