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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { ProxyService } from '../services/proxy.service';
import { PageEnabledGuard } from '../guards/page-enabled.guard';
import { TogglePage } from '../guards/toggle-page.decorator';

@ApiTags('Study Rooms')
@Controller('studyrooms')
@ApiBearerAuth('access-token')
@UseGuards(PageEnabledGuard)
@TogglePage('study-room')
export class StudyRoomProxyController {
    constructor(private readonly proxyService: ProxyService) {}

    private fwd(req: Request, method: string, path: string, body?: any) {
        return this.proxyService.forwardWithAuth(
            'exam',
            { method: method as any, path, body, headers: this.h(req) },
            this.t(req)
        );
    }

    @Post()
    @ApiOperation({ summary: 'Tạo phòng học chung' })
    async create(@Body() body: any, @Req() req: Request) {
        return this.fwd(req, 'POST', '/api/v1/studyrooms', body);
    }

    @Get('mine')
    @ApiOperation({ summary: 'Danh sách phòng của tôi' })
    async mine(@Req() req: Request) {
        return this.fwd(req, 'GET', '/api/v1/studyrooms/mine');
    }

    @Post('join')
    // Chặn brute-force mã mời 6 số (không gian 900k) — chặt hơn global 100/min.
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @ApiOperation({ summary: 'Vào phòng bằng mã mời' })
    async join(@Body() body: any, @Req() req: Request) {
        return this.fwd(req, 'POST', '/api/v1/studyrooms/join', body);
    }

    @Post(':id/join')
    @ApiOperation({ summary: 'Vào phòng bằng ID (public/whitelist/code)' })
    async joinById(
        @Param('id') id: string,
        @Body() body: any,
        @Req() req: Request
    ) {
        return this.fwd(req, 'POST', `/api/v1/studyrooms/${id}/join`, body ?? {});
    }

    @Get(':id')
    @ApiOperation({ summary: 'Chi tiết phòng' })
    async detail(@Param('id') id: string, @Req() req: Request) {
        return this.fwd(req, 'GET', `/api/v1/studyrooms/${id}`);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Cập nhật phòng' })
    async update(@Param('id') id: string, @Body() body: any, @Req() req: Request) {
        return this.fwd(req, 'PUT', `/api/v1/studyrooms/${id}`, body);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Xoá phòng' })
    async remove(@Param('id') id: string, @Req() req: Request) {
        return this.fwd(req, 'DELETE', `/api/v1/studyrooms/${id}`);
    }

    @Post(':id/leave')
    @ApiOperation({ summary: 'Rời phòng' })
    async leave(@Param('id') id: string, @Req() req: Request) {
        return this.fwd(req, 'POST', `/api/v1/studyrooms/${id}/leave`, {});
    }

    @Post(':id/regenerate-code')
    @ApiOperation({ summary: 'Đổi mã mời' })
    async regenerateCode(@Param('id') id: string, @Req() req: Request) {
        return this.fwd(req, 'POST', `/api/v1/studyrooms/${id}/regenerate-code`, {});
    }

    @Get(':id/leaderboard')
    @ApiOperation({ summary: 'Bảng xếp hạng thời gian tập trung' })
    async leaderboard(@Param('id') id: string, @Req() req: Request) {
        return this.fwd(req, 'GET', `/api/v1/studyrooms/${id}/leaderboard`);
    }

    private h(req: Request) {
        return { 'user-agent': req.headers['user-agent'] || '' };
    }
    private t(req: Request) {
        const a = req.headers.authorization;
        return a?.startsWith('Bearer ')
            ? a.substring(7)
            : (req as any).cookies?.token || (req as any).cookies?.accessToken || '';
    }
}
