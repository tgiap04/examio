import { QueryIntPipe } from '../common/query-schema';
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
    Query,
    UsePipes,
} from '@nestjs/common';
import {
    ApiTags,
    ApiResponse,
    ApiOperation,
    ApiExtraModels,
    ApiCookieAuth,
    ApiParam,
    ApiQuery,
} from '@nestjs/swagger';
import { AuthenticatedRequest } from '@kmaedu/common';
import { ExamRoomService } from './examroom.service';
import { CreateExamRoomDto } from './dto/create-examroom.dto';
import { UpdateExamRoomDto } from './dto/update-examroom.dto';
import { GetExamRoomsDto } from './dto/get-examroom.dto';
import { Public, RequirePermissions, forwardUser } from '@kmaedu/auth-jwt';

@UsePipes(ZodValidationPipe)
@ApiTags('ExamRooms')
@ApiExtraModels(CreateExamRoomDto, UpdateExamRoomDto, GetExamRoomsDto)
@Controller('examrooms')
export class ExamRoomController {
    constructor(private readonly examRoomService: ExamRoomService) {}

    @Post()
    @RequirePermissions('exam_room:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Create a new exam room (Teacher only)' })
    @ApiResponse({
        status: 201,
        description: 'Exam room created successfully',
        type: Object,
    })
    async createExamRoom(
        @Req() req: AuthenticatedRequest,
        @Body() createExamRoomDto: CreateExamRoomDto
    ) {
        return this.examRoomService.createExamRoom(req.user, createExamRoomDto, forwardUser(req));
    }

    @Get('detail/:id')
    @RequirePermissions('exam_room:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Get an exam room by ID' })
    @ApiParam({ name: 'id', description: 'Exam room ID' })
    @ApiResponse({
        status: 200,
        description: 'Exam room retrieved successfully',
        type: Object,
    })
    async getExamRoomById(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string
    ) {
        return this.examRoomService.getExamRoomById(id, req.user, forwardUser(req));
    }

    @Put(':id')
    @RequirePermissions('exam_room:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Update an exam room by ID (Teacher only)' })
    @ApiParam({ name: 'id', description: 'Exam room ID' })
    @ApiResponse({
        status: 200,
        description: 'Exam room updated successfully',
        type: Object,
    })
    async updateExamRoom(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string,
        @Body() updateExamRoomDto: UpdateExamRoomDto
    ) {
        return this.examRoomService.updateExamRoom(
            id,
            req.user,
            updateExamRoomDto,
            forwardUser(req)
        );
    }

    @Get('list')
    @RequirePermissions('exam_room:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Get a list of exam rooms' })
    @ApiResponse({
        status: 200,
        description: 'Exam rooms retrieved successfully',
        type: [Object],
    })
    async getExamRooms(
        @Req() req: AuthenticatedRequest,
        @Query() getExamRoomsDto: GetExamRoomsDto
    ) {
        return this.examRoomService.getExamRooms(req.user, getExamRoomsDto, forwardUser(req));
    }

    @Get('list-all')
    @RequirePermissions('exam_room:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Get all exam rooms without pagination' })
    @ApiResponse({
        status: 200,
        description: 'All exam rooms retrieved successfully',
        type: [Object],
    })
    async getAllExamRooms(@Req() req: AuthenticatedRequest) {
        return this.examRoomService.getAllExamRooms(req.user, forwardUser(req));
    }

    @Delete(':id')
    @RequirePermissions('exam_room:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Delete an exam room by ID (Teacher only)' })
    @ApiParam({ name: 'id', description: 'Exam room ID' })
    @ApiResponse({
        status: 200,
        description: 'Exam room deleted successfully',
        type: Object,
    })
    async deleteExamRoom(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string
    ) {
        return this.examRoomService.deleteExamRoom(id, req.user);
    }

    @Public()
    @Get('get-public/:id')
    @ApiOperation({ summary: 'Get a public exam room by ID' })
    @ApiParam({ name: 'id', description: 'Exam room ID' })
    @ApiResponse({
        status: 200,
        description: 'Public exam room retrieved successfully',
        type: Object,
    })
    async getPublicExamRoomById(@Param('id') id: string) {
        return this.examRoomService.getExamRoomPublicById(id);
    }

    @Get(':id/sessions')
    @RequirePermissions('exam_room:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Get exam sessions for an exam room' })
    @ApiParam({ name: 'id', description: 'Exam room ID' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiResponse({
        status: 200,
        description: 'Exam sessions retrieved successfully',
        type: Object,
    })
    async getExamSessions(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string,
        @Query('page', new QueryIntPipe()) page?: number,
        @Query('limit', new QueryIntPipe({ max: 100 })) limit?: number
    ) {
        return this.examRoomService.getExamSessions(
            id,
            req.user,
            forwardUser(req),
            page ? Number(page) : 1,
            limit ? Number(limit) : 10
        );
    }
}
