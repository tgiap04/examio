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
    HttpCode,
} from '@nestjs/common';
import {
    ApiTags,
    ApiResponse,
    ApiOperation,
    ApiExtraModels,
    ApiCookieAuth,
    ApiParam,
} from '@nestjs/swagger';
import { AuthenticatedRequest } from '@examio/common';
import { ExamSessionService } from './examsession.service';
import { CreateExamSessionDto } from './dto/create-examsession.dto';
import { UpdateExamSessionDto } from './dto/update-examsession.dto';
import { GetExamSessionsDto } from './dto/get-examsession.dto';
import {
    ExamSessionUpdateSharingSettingsDto,
    ExamSessionVerifyAccessCodeDto,
    ExamSessionAccessCheckResponseDto,
    ExamSessionVerifyCodeResponseDto,
    ExamSessionSharingSettingsResponseDto,
    ExamSessionPublicInfoDto,
} from './dto/sharing.dto';
import { Public, RequirePermissions, forwardUser } from '@examio/auth-jwt';
import { SearchQueryPipe, UserSearchService } from '../common/user-search.service';

@UsePipes(ZodValidationPipe)
@ApiTags('ExamSessions')
@ApiExtraModels(CreateExamSessionDto, UpdateExamSessionDto, GetExamSessionsDto)
@Controller('examsessions')
export class ExamSessionController {
    constructor(
        private readonly examSessionService: ExamSessionService,
        private readonly userSearch: UserSearchService
    ) {}

    @Post()
    @RequirePermissions('exam_session:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Create a new exam session' })
    @ApiResponse({
        status: 201,
        description: 'Exam session created successfully',
        type: Object,
    })
    async createExamSession(
        @Req() req: AuthenticatedRequest,
        @Body() createExamSessionDto: CreateExamSessionDto
    ) {
        return this.examSessionService.createExamSession(
            req.user,
            createExamSessionDto,
            forwardUser(req)
        );
    }

    @Get('get-by-id/:id')
    @RequirePermissions('exam_session:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Get an exam session by ID' })
    @ApiParam({ name: 'id', description: 'Exam session ID' })
    @ApiResponse({
        status: 200,
        description: 'Exam session retrieved successfully',
        type: Object,
    })
    async getExamSessionById(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string
    ) {
        return this.examSessionService.getExamSessionById(id, req.user, forwardUser(req));
    }

    @Put(':id')
    @RequirePermissions('exam_session:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Update an exam session by ID' })
    @ApiParam({ name: 'id', description: 'Exam session ID' })
    @ApiResponse({
        status: 200,
        description: 'Exam session updated successfully',
        type: Object,
    })
    async updateExamSession(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string,
        @Body() updateExamSessionDto: UpdateExamSessionDto
    ) {
        return this.examSessionService.updateExamSession(
            id,
            req.user,
            updateExamSessionDto
        );
    }

    @Get('list')
    @RequirePermissions('exam_session:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Get a list of exam sessions' })
    @ApiResponse({
        status: 200,
        description: 'Exam sessions retrieved successfully',
        type: [Object],
    })
    async getExamSessions(
        @Req() req: AuthenticatedRequest,
        @Query() getExamSessionsDto: GetExamSessionsDto
    ) {
        return this.examSessionService.getExamSessions(
            req.user,
            getExamSessionsDto
        );
    }

    @Delete(':id')
    @RequirePermissions('exam_session:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Delete an exam session by ID' })
    @ApiParam({ name: 'id', description: 'Exam session ID' })
    @ApiResponse({
        status: 200,
        description: 'Exam session deleted successfully',
        type: Object,
    })
    async deleteExamSession(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string
    ) {
        return this.examSessionService.deleteExamSession(id, req.user);
    }

    @Public()
    @Get('get-public/:id')
    @ApiOperation({ summary: 'Get a public exam session by ID' })
    @ApiParam({ name: 'id', description: 'Exam session ID' })
    @ApiResponse({
        status: 200,
        description: 'Public exam session retrieved successfully',
        type: Object,
    })
    async getPublicExamSessionById(@Param('id') id: string) {
        return this.examSessionService.getExamSessionPublicById(id);
    }

    // ==================== ACCESS CONTROL ENDPOINTS ====================

    @Get('study/:id/access')
    @Public()
    @ApiOperation({ summary: 'Check access for an exam session' })
    @ApiParam({ name: 'id', description: 'Exam session ID' })
    @ApiResponse({
        status: 200,
        description: 'Access check result',
        type: ExamSessionAccessCheckResponseDto,
    })
    async checkAccess(
        @Param('id') id: string,
        @Req() req: AuthenticatedRequest
    ) {
        return this.examSessionService.checkAccess(id, req.user?.id);
    }

    @Public()
    @Get('study/:id/info')
    @ApiOperation({ summary: 'Get public info for an exam session' })
    @ApiParam({ name: 'id', description: 'Exam session ID' })
    @ApiResponse({
        status: 200,
        description: 'Exam session public info',
        type: ExamSessionPublicInfoDto,
    })
    async getPublicInfo(@Param('id') id: string) {
        return this.examSessionService.getExamSessionPublicInfo(id);
    }

    @Get('study/:id')
    @RequirePermissions('exam:take')
    @ApiOperation({ summary: 'Get exam session for study with access check' })
    @ApiParam({ name: 'id', description: 'Exam session ID' })
    @ApiResponse({
        status: 200,
        description: 'Exam session for study',
        type: Object,
    })
    async getForStudy(
        @Param('id') id: string,
        @Req() req: AuthenticatedRequest
    ) {
        return this.examSessionService.getExamSessionForStudy(id, req.user.id);
    }

    @RequirePermissions('exam:take')
    @Post('study/:id/verify-code')
    @ApiOperation({ summary: 'Verify access code for a private exam session' })
    @ApiParam({ name: 'id', description: 'Exam session ID' })
    @ApiResponse({
        status: 200,
        description: 'Code verification result',
        type: ExamSessionVerifyCodeResponseDto,
    })
    async verifyCode(
        @Param('id') id: string,
        @Body() dto: ExamSessionVerifyAccessCodeDto,
        @Req() req: AuthenticatedRequest
    ) {
        return this.examSessionService.verifyAccessCode(
            id,
            dto.accessCode,
            req.user.id
        );
    }

    @RequirePermissions('exam:take')
    @Post('study/:id/with-code')
    @ApiOperation({ summary: 'Get exam session using access code' })
    @ApiParam({ name: 'id', description: 'Exam session ID' })
    @ApiResponse({
        status: 200,
        description: 'Exam session for study',
        type: Object,
    })
    async getWithCode(
        @Param('id') id: string,
        @Body() dto: ExamSessionVerifyAccessCodeDto,
        @Req() req: AuthenticatedRequest
    ) {
        return this.examSessionService.getExamSessionWithCode(
            id,
            dto.accessCode,
            req.user.id
        );
    }

    @Get(':id/sharing')
    @RequirePermissions('exam_session:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Get sharing settings for an exam session' })
    @ApiParam({ name: 'id', description: 'Exam session ID' })
    @ApiResponse({
        status: 200,
        description: 'Sharing settings',
    })
    async getSharingSettings(
        @Param('id') id: string,
        @Req() req: AuthenticatedRequest
    ) {
        return this.examSessionService.getSharingSettings(id, req.user);
    }

    @Put(':id/sharing')
    @RequirePermissions('exam_session:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Update sharing settings for an exam session' })
    @ApiParam({ name: 'id', description: 'Exam session ID' })
    @ApiResponse({
        status: 200,
        description: 'Sharing settings updated',
        type: ExamSessionSharingSettingsResponseDto,
    })
    async updateSharingSettings(
        @Param('id') id: string,
        @Req() req: AuthenticatedRequest,
        @Body() dto: ExamSessionUpdateSharingSettingsDto
    ) {
        return this.examSessionService.updateSharingSettings(id, req.user, dto);
    }

    @Post(':id/generate-code')
    @RequirePermissions('exam_session:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Generate a new access code' })
    @ApiParam({ name: 'id', description: 'Exam session ID' })
    @ApiResponse({
        status: 200,
        description: 'New access code generated',
    })
    async generateCode(
        @Param('id') id: string,
        @Req() req: AuthenticatedRequest
    ) {
        return this.examSessionService.regenerateAccessCode(id, req.user);
    }

    @Get('users/search')
    @RequirePermissions('user:search')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Search users by username for whitelist' })
    @ApiResponse({
        status: 200,
        description: 'List of matching users',
    })
    async searchUsers(
        @Query('q', SearchQueryPipe) query: string,
        @Req() req: AuthenticatedRequest
    ) {
        return this.userSearch.search(query, req.user.id, forwardUser(req));
    }

    @Get('study/:id/stats')
    @RequirePermissions('exam:take')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({
        summary: 'Get exam session stats for student display',
    })
    @ApiParam({ name: 'id', description: 'Exam session ID' })
    @ApiResponse({
        status: 200,
        description: 'Exam session stats for display',
        type: Object,
    })
    async getStatsForStudent(
        @Param('id') id: string,
        @Req() req: AuthenticatedRequest
    ) {
        return this.examSessionService.getExamSessionStatsForStudent(
            id,
            req.user.id
        );
    }

    @Get('room/:roomId/available-labels')
    @RequirePermissions('exam_session:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({
        summary: 'Get available labels and question counts for an exam room',
        description: 'Returns labels from the linked quiz set with question counts for configuring question selection',
    })
    @ApiParam({ name: 'roomId', description: 'Exam room ID' })
    @ApiResponse({
        status: 200,
        description: 'Available labels with question counts',
        schema: {
            type: 'object',
            properties: {
                totalQuestions: { type: 'number' },
                labels: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            color: { type: 'string', nullable: true },
                            questionCount: { type: 'number' },
                        },
                    },
                },
                unlabeledCount: { type: 'number' },
            },
        },
    })
    async getAvailableLabelsForExamRoom(
        @Param('roomId') roomId: string,
        @Req() req: AuthenticatedRequest,
        @Query('sessionId') sessionId?: string
    ) {
        return this.examSessionService.getAvailableLabelsForExamRoom(
            roomId,
            req.user,
            forwardUser(req),
            sessionId || undefined
        );
    }

    @Post(':id/refresh-snapshot')
    @HttpCode(200)
    @RequirePermissions('exam_session:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({
        summary: 'Re-take the quiz snapshot of a session that has not started and has no attempts',
        description: '200 { quizSnapshotHash }; 409 SNAPSHOT_LOCKED once the session started or has an attempt',
    })
    @ApiParam({ name: 'id', description: 'Exam session ID' })
    @ApiResponse({ status: 200, description: 'Snapshot refreshed', type: Object })
    async refreshSnapshot(
        @Param('id') id: string,
        @Req() req: AuthenticatedRequest
    ) {
        return this.examSessionService.refreshSnapshot(id, req.user, forwardUser(req));
    }
}
