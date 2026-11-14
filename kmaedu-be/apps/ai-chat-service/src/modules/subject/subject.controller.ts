import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SubjectService } from './subject.service';
import { Public } from '@kmaedu/auth-jwt';

@ApiTags('Subjects')
@Controller('subjects')
export class SubjectController {
    constructor(private readonly subjectService: SubjectService) {}

    @Public()
    @Get('categories')
    @ApiOperation({ summary: 'Lấy danh sách nhóm môn học với các môn học' })
    @ApiResponse({ status: 200, description: 'Danh sách nhóm môn học' })
    async getCategories() {
        return this.subjectService.getCategories();
    }

    @Public()
    @Get()
    @ApiOperation({ summary: 'Lấy danh sách tất cả môn học' })
    @ApiResponse({ status: 200, description: 'Danh sách môn học' })
    async getSubjects() {
        return this.subjectService.getSubjects();
    }

    @Public()
    @Get(':id')
    @ApiOperation({ summary: 'Lấy thông tin môn học theo ID' })
    @ApiResponse({ status: 200, description: 'Thông tin môn học' })
    @ApiResponse({ status: 404, description: 'Không tìm thấy môn học' })
    async getSubjectById(@Param('id') id: string) {
        return this.subjectService.getSubjectById(id);
    }

    @Public()
    @Get('slug/:slug')
    @ApiOperation({ summary: 'Lấy thông tin môn học theo slug' })
    @ApiResponse({ status: 200, description: 'Thông tin môn học' })
    @ApiResponse({ status: 404, description: 'Không tìm thấy môn học' })
    async getSubjectBySlug(@Param('slug') slug: string) {
        return this.subjectService.getSubjectBySlug(slug);
    }
}
