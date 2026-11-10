import { ZodValidationPipe } from 'nestjs-zod';
import {
    Controller,
    Get,
    Post,
    Delete,
    Param,
    Body,
    Req,
    HttpCode,
    HttpStatus,
    UsePipes,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiParam,
    ApiCookieAuth,
} from '@nestjs/swagger';
import { AuthenticatedRequest } from '@kmaedu/common';
import { WordFamilyService } from './word-family.service';
import {
    GenerateWordFamilyDto,
    GenerateRootWordFamilyDto,
    SaveWordFamilyDto,
} from './dto/word-family.dto';
import { RequirePermissions } from '@kmaedu/auth-jwt';

@UsePipes(ZodValidationPipe)
@ApiTags('Word Family')
@Controller('word-family')
export class WordFamilyController {
    constructor(
        private readonly service: WordFamilyService,
    ) {}

    // ==================== Category Endpoints ====================

    @Get('categories')
    @RequirePermissions('word_family:read')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Lấy danh sách danh mục word family' })
    async getCategories() {
        return this.service.getCategories();
    }

    // ==================== Root Words & Detail ====================

    @Get('categories/:slug/roots')
    @RequirePermissions('word_family:read')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Lấy danh sách root words trong danh mục' })
    @ApiParam({ name: 'slug', description: 'Category slug' })
    async getRootWords(@Param('slug') slug: string) {
        return this.service.getRootWords(slug);
    }

    @Get('category/:categorySlug/:rootWord')
    @RequirePermissions('word_family:read')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Lấy chi tiết word family' })
    @ApiParam({ name: 'categorySlug', description: 'Category slug' })
    @ApiParam({ name: 'rootWord', description: 'Root word' })
    async getWordFamily(
        @Param('categorySlug') categorySlug: string,
        @Param('rootWord') rootWord: string,
    ) {
        return this.service.getWordFamily(rootWord, categorySlug);
    }

    // ==================== Generation ====================

    @Post('generate')
    @RequirePermissions('word_family:generate')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Sinh word family bằng AI' })
    async generateWordFamily(
        @Req() req: AuthenticatedRequest,
        @Body() dto: GenerateWordFamilyDto,
    ) {
        return this.service.generateWordFamily(req.user, dto);
    }

    @Post('generate-root')
    @RequirePermissions('word_family:generate')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Sinh từ con cho một từ gốc cụ thể (ghi đè nếu đã có)' })
    async generateWordFamilyForRoot(
        @Req() req: AuthenticatedRequest,
        @Body() dto: GenerateRootWordFamilyDto,
    ) {
        return this.service.generateWordFamilyForRoot(req.user, dto);
    }

    @Get('generation-status/:slug')
    @RequirePermissions('word_family:read')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Kiểm tra trạng thái sinh word family đang chạy' })
    @ApiParam({ name: 'slug', description: 'Category slug' })
    async getGenerationStatus(
        @Req() req: AuthenticatedRequest,
        @Param('slug') slug: string,
    ) {
        return this.service.getGenerationStatus(req.user, slug);
    }

    @Get('generation-status/:slug/:rootWord')
    @RequirePermissions('word_family:read')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Kiểm tra trạng thái sinh từ con cho một từ gốc' })
    @ApiParam({ name: 'slug', description: 'Category slug' })
    @ApiParam({ name: 'rootWord', description: 'Root word' })
    async getRootGenerationStatus(
        @Req() req: AuthenticatedRequest,
        @Param('slug') slug: string,
        @Param('rootWord') rootWord: string,
    ) {
        return this.service.getRootGenerationStatus(req.user, slug, rootWord);
    }

    // ==================== User Collections ====================

    @Post('save')
    @RequirePermissions('word_family:save')
    @ApiCookieAuth('cookie-auth')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Lưu word family vào bộ sưu tập' })
    async saveToCollection(
        @Req() req: AuthenticatedRequest,
        @Body() dto: SaveWordFamilyDto,
    ) {
        return this.service.saveToCollection(req.user, dto);
    }

    @Get('saved')
    @RequirePermissions('word_family:save')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Lấy bộ sưu tập word family đã lưu' })
    async getSavedCollections(@Req() req: AuthenticatedRequest) {
        return this.service.getSavedCollections(req.user);
    }

    @Delete('saved/:wordFamilyId')
    @RequirePermissions('word_family:save')
    @ApiCookieAuth('cookie-auth')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Xóa khỏi bộ sưu tập' })
    @ApiParam({ name: 'wordFamilyId', description: 'Word Family ID' })
    async removeFromCollection(
        @Req() req: AuthenticatedRequest,
        @Param('wordFamilyId') wordFamilyId: string,
    ) {
        return this.service.removeFromCollection(req.user, wordFamilyId);
    }
}
