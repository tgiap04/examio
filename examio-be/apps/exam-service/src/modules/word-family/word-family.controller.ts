import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    Req,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiParam,
    ApiCookieAuth,
} from '@nestjs/swagger';
import { AuthGuard, AdminGuard, AuthenticatedRequest } from '@examio/common';
import { WordFamilyService } from './word-family.service';
import { WordFamilyBridgeService } from './word-family-bridge.service';
import {
    GenerateWordFamilyDto,
    SaveWordFamilyDto,
    ToFlashcardDto,
    CreateCategoryDto,
    UpdateCategoryDto,
} from './dto/word-family.dto';

@ApiTags('Word Family')
@Controller('word-family')
export class WordFamilyController {
    constructor(
        private readonly service: WordFamilyService,
        private readonly bridgeService: WordFamilyBridgeService,
    ) {}

    // ==================== Category Endpoints ====================

    @Get('categories')
    @UseGuards(AuthGuard)
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Lấy danh sách danh mục word family' })
    async getCategories() {
        return this.service.getCategories();
    }

    @Post('categories')
    @UseGuards(AuthGuard, AdminGuard)
    @ApiCookieAuth('cookie-auth')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Tạo danh mục word family (admin)' })
    async createCategory(@Body() body: CreateCategoryDto) {
        return this.service.createCategory(body);
    }

    @Put('categories/:id')
    @UseGuards(AuthGuard, AdminGuard)
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
    @UseGuards(AuthGuard, AdminGuard)
    @ApiCookieAuth('cookie-auth')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Xóa danh mục word family (admin, soft-delete)' })
    @ApiParam({ name: 'id', description: 'Category ID' })
    async deleteCategory(@Param('id') id: string) {
        return this.service.deleteCategory(id);
    }

    // ==================== Root Words & Detail ====================

    @Get('categories/:slug/roots')
    @UseGuards(AuthGuard)
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Lấy danh sách root words trong danh mục' })
    @ApiParam({ name: 'slug', description: 'Category slug' })
    async getRootWords(@Param('slug') slug: string) {
        return this.service.getRootWords(slug);
    }

    @Get('category/:categorySlug/:rootWord')
    @UseGuards(AuthGuard)
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
    @UseGuards(AuthGuard)
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Sinh word family bằng AI' })
    async generateWordFamily(
        @Req() req: AuthenticatedRequest,
        @Body() dto: GenerateWordFamilyDto,
    ) {
        return this.service.generateWordFamily(req.user, dto);
    }

    // ==================== User Collections ====================

    @Post('save')
    @UseGuards(AuthGuard)
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
    @UseGuards(AuthGuard)
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Lấy bộ sưu tập word family đã lưu' })
    async getSavedCollections(@Req() req: AuthenticatedRequest) {
        return this.service.getSavedCollections(req.user);
    }

    @Delete('saved/:wordFamilyId')
    @UseGuards(AuthGuard)
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
    @UseGuards(AuthGuard)
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
