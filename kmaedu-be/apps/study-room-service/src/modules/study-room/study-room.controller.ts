import { ZodValidationPipe } from 'nestjs-zod';
import {
    Controller,
    Post,
    Body,
    Req,
    Get,
    Put,
    Delete,
    Param,
    UsePipes,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth, ApiParam } from '@nestjs/swagger';
import { AuthenticatedRequest } from '@kmaedu/common';
import { StudyRoomService } from './study-room.service';
import {
    CreateStudyRoomDto,
    UpdateStudyRoomDto,
    JoinByCodeDto,
    JoinRoomDto,
} from './dto/study-room.dto';
import { RequirePermissions } from '@kmaedu/auth-jwt';

@UsePipes(ZodValidationPipe)
@ApiTags('StudyRooms')
@Controller('studyrooms')
@ApiCookieAuth('cookie-auth')
export class StudyRoomController {
    constructor(private readonly service: StudyRoomService) {}

    @Post()
    @RequirePermissions('study_room:create')
    @ApiOperation({ summary: 'Tạo phòng học chung' })
    async create(
        @Req() req: AuthenticatedRequest,
        @Body() dto: CreateStudyRoomDto
    ) {
        return this.service.createRoom(req.user, dto);
    }

    @Get('mine')
    @RequirePermissions('study_room:join')
    @ApiOperation({ summary: 'Danh sách phòng của tôi (host + member)' })
    async mine(@Req() req: AuthenticatedRequest) {
        return this.service.getMyRooms(req.user);
    }

    @Post('join')
    @RequirePermissions('study_room:join')
    @ApiOperation({ summary: 'Vào phòng bằng mã mời' })
    async join(@Req() req: AuthenticatedRequest, @Body() dto: JoinByCodeDto) {
        return this.service.joinByCode(req.user, dto.inviteCode);
    }

    @Post(':id/join')
    @RequirePermissions('study_room:join')
    @ApiOperation({ summary: 'Vào phòng bằng ID (public/whitelist; code cần inviteCode)' })
    @ApiParam({ name: 'id' })
    async joinById(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string,
        @Body() dto: JoinRoomDto
    ) {
        return this.service.joinById(req.user, id, dto?.inviteCode);
    }

    @Get(':id')
    @RequirePermissions('study_room:join')
    @ApiOperation({ summary: 'Chi tiết phòng (member)' })
    @ApiParam({ name: 'id' })
    async detail(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string
    ) {
        return this.service.getRoomDetail(id, req.user);
    }

    @Put(':id')
    @RequirePermissions('study_room:create')
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
    @RequirePermissions('study_room:create')
    @ApiOperation({ summary: 'Xoá phòng (host)' })
    @ApiParam({ name: 'id' })
    async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
        return this.service.deleteRoom(id, req.user);
    }

    @Post(':id/leave')
    @RequirePermissions('study_room:join')
    @ApiOperation({ summary: 'Rời phòng (member)' })
    @ApiParam({ name: 'id' })
    async leave(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
        return this.service.leaveRoom(id, req.user);
    }

    @Post(':id/regenerate-code')
    @RequirePermissions('study_room:create')
    @ApiOperation({ summary: 'Đổi mã mời (host)' })
    @ApiParam({ name: 'id' })
    async regenerateCode(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string
    ) {
        return this.service.regenerateCode(id, req.user);
    }

    @Get(':id/leaderboard')
    @RequirePermissions('study_room:join')
    @ApiOperation({ summary: 'Bảng xếp hạng thời gian tập trung (member)' })
    @ApiParam({ name: 'id' })
    async leaderboard(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string
    ) {
        return this.service.getLeaderboard(id, req.user);
    }
}
