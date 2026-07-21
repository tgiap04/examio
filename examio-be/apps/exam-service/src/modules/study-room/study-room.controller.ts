import {
    Controller,
    Post,
    Body,
    UseGuards,
    Req,
    Get,
    Put,
    Delete,
    Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth, ApiParam } from '@nestjs/swagger';
import { AuthGuard, AuthenticatedRequest } from '@examio/common';
import { StudyRoomService } from './study-room.service';
import {
    CreateStudyRoomDto,
    UpdateStudyRoomDto,
    JoinByCodeDto,
    JoinRoomDto,
} from './dto/study-room.dto';

@ApiTags('StudyRooms')
@Controller('studyrooms')
@UseGuards(AuthGuard)
@ApiCookieAuth('cookie-auth')
export class StudyRoomController {
    constructor(private readonly service: StudyRoomService) {}

    @Post()
    @ApiOperation({ summary: 'Tạo phòng học chung' })
    async create(
        @Req() req: AuthenticatedRequest,
        @Body() dto: CreateStudyRoomDto
    ) {
        return this.service.createRoom(req.user, dto);
    }

    @Get('mine')
    @ApiOperation({ summary: 'Danh sách phòng của tôi (host + member)' })
    async mine(@Req() req: AuthenticatedRequest) {
        return this.service.getMyRooms(req.user);
    }

    @Post('join')
    @ApiOperation({ summary: 'Vào phòng bằng mã mời' })
    async join(@Req() req: AuthenticatedRequest, @Body() dto: JoinByCodeDto) {
        return this.service.joinByCode(req.user, dto.inviteCode);
    }

    @Post(':id/join')
    @ApiOperation({ summary: 'Vào phòng bằng ID (public/whitelist; code cần inviteCode)' })
    @ApiParam({ name: 'id' })
    async joinById(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string,
        @Body() dto: JoinRoomDto
    ) {
        return this.service.joinById(req.user, id, dto.inviteCode);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Chi tiết phòng (member)' })
    @ApiParam({ name: 'id' })
    async detail(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string
    ) {
        return this.service.getRoomDetail(id, req.user);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Cập nhật phòng (host)' })
    @ApiParam({ name: 'id' })
    async update(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string,
        @Body() dto: UpdateStudyRoomDto
    ) {
        return this.service.updateRoom(id, req.user, dto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Xoá phòng (host)' })
    @ApiParam({ name: 'id' })
    async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
        return this.service.deleteRoom(id, req.user);
    }

    @Post(':id/leave')
    @ApiOperation({ summary: 'Rời phòng (member)' })
    @ApiParam({ name: 'id' })
    async leave(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
        return this.service.leaveRoom(id, req.user);
    }

    @Post(':id/regenerate-code')
    @ApiOperation({ summary: 'Đổi mã mời (host)' })
    @ApiParam({ name: 'id' })
    async regenerateCode(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string
    ) {
        return this.service.regenerateCode(id, req.user);
    }

    @Get(':id/leaderboard')
    @ApiOperation({ summary: 'Bảng xếp hạng thời gian tập trung (member)' })
    @ApiParam({ name: 'id' })
    async leaderboard(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string
    ) {
        return this.service.getLeaderboard(id, req.user);
    }
}
