import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    Req,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiParam,
    ApiCookieAuth,
} from '@nestjs/swagger';
import { AuthenticatedRequest } from '@examio/common';
import { WordFamilyService } from './word-family.service';
import { WordFamilyBridgeService } from './word-family-bridge.service';
import {
    GenerateWordFamilyDto,
    GenerateRootWordFamilyDto,
    SaveWordFamilyDto,
    ToFlashcardDto,
    CreateCategoryDto,
    UpdateCategoryDto,
} from './dto/word-family.dto';
import { Authenticated, RequirePermissions } from '@examio/auth-jwt';

@ApiTags('Word Family')
@Controller('word-family')
export class WordFamilyController {
    constructor(
        private readonly service: WordFamilyService,
        private readonly bridgeService: WordFamilyBridgeService,
    ) {}

    // ==================== Category Endpoints ====================

    @Get('categories')
    @Authenticated()
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Lấy danh sách danh mục word family' })
    async getCategories() {
        return this.service.getCategories();
    }

    @Post('categories')
    @RequirePermissions('word_family:admin')
    @ApiCookieAuth('cookie-auth')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Tạo danh mục word family (admin)' })
    async createCategory(@Body() body: CreateCategoryDto) {
        return this.service.createCategory(body);
    }

    @Put('categories/:id')
    @RequirePermissions('word_family:admin')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Cập nhật danh mục word family (admin)' })
    @ApiParam({ name: 'id', description: 'Category ID' })
    async updateCategory(
        @Param('id') id: string,
        @Body() body: UpdateCategoryDto,
    ) {
        return this.service.updateCategory(id, body);
    }

    @Delete('categories/:id')
    @RequirePermissions('word_family:admin')
    @ApiCookieAuth('cookie-auth')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Xóa danh mục word family (admin, soft-delete)' })
    @ApiParam({ name: 'id', description: 'Category ID' })
    async deleteCategory(@Param('id') id: string) {
        return this.service.deleteCategory(id);
    }

    // ==================== Root Words & Detail ====================

    @Get('categories/:slug/roots')
    @Authenticated()
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Lấy danh sách root words trong danh mục' })
    @ApiParam({ name: 'slug', description: 'Category slug' })
    async getRootWords(@Param('slug') slug: string) {
        return this.service.getRootWords(slug);
    }

    @Get('category/:categorySlug/:rootWord')
    @Authenticated()
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
    @Authenticated()
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Sinh word family bằng AI' })
    async generateWordFamily(
        @Req() req: AuthenticatedRequest,
        @Body() dto: GenerateWordFamilyDto,
    ) {
        return this.service.generateWordFamily(req.user, dto);
    }

    @Post('generate-root')
    @Authenticated()
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Sinh từ con cho một từ gốc cụ thể (ghi đè nếu đã có)' })
    async generateWordFamilyForRoot(
        @Req() req: AuthenticatedRequest,
        @Body() dto: GenerateRootWordFamilyDto,
    ) {
        return this.service.generateWordFamilyForRoot(req.user, dto);
    }

    @Get('generation-status/:slug')
    @Authenticated()
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
    @Authenticated()
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
    @Authenticated()
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
    @Authenticated()
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Lấy bộ sưu tập word family đã lưu' })
    async getSavedCollections(@Req() req: AuthenticatedRequest) {
        return this.service.getSavedCollections(req.user);
    }

    @Delete('saved/:wordFamilyId')
    @Authenticated()
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

    // ==================== FlashCard Bridge ====================

    @Post(':id/to-flashcard')
    @Authenticated()
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Chuyển word family thành bộ flashcard' })
    @ApiParam({ name: 'id', description: 'Word Family ID' })
    async toFlashcard(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string,
        @Body() dto: ToFlashcardDto,
    ) {
        return this.bridgeService.createFlashcardDeck(
            req.user,
            id,
            dto.selectedIndices,
        );
    }
}
