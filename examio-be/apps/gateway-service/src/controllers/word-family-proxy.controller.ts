import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    Query,
    Req,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiBearerAuth,
    ApiParam,
    ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { UseGuards } from '@nestjs/common';
import { ProxyService } from '../services/proxy.service';
import { PageEnabledGuard } from '../guards/page-enabled.guard';
import { TogglePage } from '../guards/toggle-page.decorator';

@ApiTags('Word Family')
@Controller('word-family')
@ApiBearerAuth('access-token')
@UseGuards(PageEnabledGuard)
@TogglePage('word-family')
export class WordFamilyProxyController {
    constructor(private readonly proxyService: ProxyService) {}

    // ==================== Categories ====================

    @Get('categories')
    @ApiOperation({ summary: 'Lấy danh sách danh mục word family' })
    async getCategories(@Req() req: Request) {
        return this.proxyService.forwardWithAuth(
            'exam',
            {
                method: 'GET',
                path: '/api/v1/word-family/categories',
                headers: this.h(req),
            },
            this.t(req),
        );
    }

    @Post('categories')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Tạo danh mục word family (admin)' })
    async createCategory(@Body() body: any, @Req() req: Request) {
        return this.proxyService.forwardWithAuth(
            'exam',
            {
                method: 'POST',
                path: '/api/v1/word-family/categories',
                body,
                headers: this.h(req),
            },
            this.t(req),
        );
    }

    @Put('categories/:id')
    @ApiOperation({ summary: 'Cập nhật danh mục word family (admin)' })
    @ApiParam({ name: 'id', description: 'Category ID' })
    async updateCategory(
        @Param('id') id: string,
        @Body() body: any,
        @Req() req: Request,
    ) {
        return this.proxyService.forwardWithAuth(
            'exam',
            {
                method: 'PUT',
                path: `/api/v1/word-family/categories/${id}`,
                body,
                headers: this.h(req),
            },
            this.t(req),
        );
    }

    @Delete('categories/:id')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Xóa danh mục word family (admin, soft-delete)' })
    @ApiParam({ name: 'id', description: 'Category ID' })
    async deleteCategory(@Param('id') id: string, @Req() req: Request) {
        return this.proxyService.forwardWithAuth(
            'exam',
            {
                method: 'DELETE',
                path: `/api/v1/word-family/categories/${id}`,
                headers: this.h(req),
            },
            this.t(req),
        );
    }

    // ==================== Root Words ====================

    @Get('categories/:slug/roots')
    @ApiOperation({ summary: 'Lấy danh sách root words trong danh mục' })
    @ApiParam({ name: 'slug', description: 'Category slug' })
    async getRootWords(@Param('slug') slug: string, @Req() req: Request) {
        return this.proxyService.forwardWithAuth(
            'exam',
            {
                method: 'GET',
                path: `/api/v1/word-family/categories/${slug}/roots`,
                headers: this.h(req),
            },
            this.t(req),
        );
    }

    // ==================== Word Family Detail ====================

    @Get('category/:categorySlug/:rootWord')
    @ApiOperation({ summary: 'Lấy chi tiết word family' })
    @ApiParam({ name: 'categorySlug', description: 'Category slug' })
    @ApiParam({ name: 'rootWord', description: 'Root word' })
    async getWordFamily(
        @Param('categorySlug') categorySlug: string,
        @Param('rootWord') rootWord: string,
        @Req() req: Request,
    ) {
        return this.proxyService.forwardWithAuth(
            'exam',
            {
                method: 'GET',
                path: `/api/v1/word-family/category/${categorySlug}/${rootWord}`,
                headers: this.h(req),
            },
            this.t(req),
        );
    }

    // ==================== Generation ====================

    @Post('generate')
    @ApiOperation({ summary: 'Sinh word family bằng AI' })
    async generateWordFamily(@Body() body: any, @Req() req: Request) {
        return this.proxyService.forwardWithAuth(
            'exam',
            {
                method: 'POST',
                path: '/api/v1/word-family/generate',
                body,
                headers: this.h(req),
            },
            this.t(req),
        );
    }

    @Get('generation-status/:slug')
    @ApiOperation({ summary: 'Kiểm tra trạng thái sinh word family đang chạy' })
    @ApiParam({ name: 'slug', description: 'Category slug' })
    async getGenerationStatus(@Param('slug') slug: string, @Req() req: Request) {
        return this.proxyService.forwardWithAuth(
            'exam',
            {
                method: 'GET',
                path: `/api/v1/word-family/generation-status/${slug}`,
                headers: this.h(req),
            },
            this.t(req),
        );
    }

    // ==================== User Collections ====================

    @Post('save')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Lưu word family vào bộ sưu tập' })
    async saveToCollection(@Body() body: any, @Req() req: Request) {
        return this.proxyService.forwardWithAuth(
            'exam',
            {
                method: 'POST',
                path: '/api/v1/word-family/save',
                body,
                headers: this.h(req),
            },
            this.t(req),
        );
    }

    @Get('saved')
    @ApiOperation({ summary: 'Lấy bộ sưu tập word family đã lưu' })
    async getSavedCollections(@Req() req: Request) {
        return this.proxyService.forwardWithAuth(
            'exam',
            {
                method: 'GET',
                path: '/api/v1/word-family/saved',
                headers: this.h(req),
            },
            this.t(req),
        );
    }

    @Delete('saved/:wordFamilyId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Xóa khỏi bộ sưu tập' })
    @ApiParam({ name: 'wordFamilyId', description: 'Word Family ID' })
    async removeFromCollection(
        @Param('wordFamilyId') wordFamilyId: string,
        @Req() req: Request,
    ) {
        return this.proxyService.forwardWithAuth(
            'exam',
            {
                method: 'DELETE',
                path: `/api/v1/word-family/saved/${wordFamilyId}`,
                headers: this.h(req),
            },
            this.t(req),
        );
    }

    // ==================== FlashCard Bridge ====================

    @Post(':id/to-flashcard')
    @ApiOperation({ summary: 'Chuyển word family thành bộ flashcard' })
    @ApiParam({ name: 'id', description: 'Word Family ID' })
    async toFlashcard(
        @Param('id') id: string,
        @Body() body: any,
        @Req() req: Request,
    ) {
        return this.proxyService.forwardWithAuth(
            'exam',
            {
                method: 'POST',
                path: `/api/v1/word-family/${id}/to-flashcard`,
                body,
                headers: this.h(req),
            },
            this.t(req),
        );
    }

    private h(req: Request) {
        return { 'user-agent': req.headers['user-agent'] || '' };
    }

    private t(req: Request) {
        const a = req.headers.authorization;
        if (a?.startsWith('Bearer ')) return a.substring(7);
        return req.cookies?.token || req.cookies?.accessToken || '';
    }
}
