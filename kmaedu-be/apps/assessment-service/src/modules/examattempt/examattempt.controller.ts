import { UpdateProgressDto, SecureSubmitDto } from './dto/progress.dto';
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
} from '@nestjs/swagger';
import { AuthenticatedRequest } from '@kmaedu/common';
import { ExamAttemptService } from './examattempt.service';
import { CreateExamAttemptDto } from './dto/create-examattempt.dto';
import { UpdateExamAttemptDto } from './dto/update-examattempt.dto';
import { GetExamAttemptsDto } from './dto/get-examattempt.dto';
import { Authenticated, forwardUser, RequirePermissions } from '@kmaedu/auth-jwt';

@UsePipes(ZodValidationPipe)
@ApiTags('ExamAttempts')
@ApiExtraModels(CreateExamAttemptDto, UpdateExamAttemptDto, GetExamAttemptsDto)
@Controller('examattempts')
export class ExamAttemptController {
    constructor(private readonly examAttemptService: ExamAttemptService) {}

    // ==================== HISTORY STATS ENDPOINT ====================

    @Get('history-stats')
    @RequirePermissions('exam:take')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Get aggregated history statistics for user' })
    @ApiResponse({
        status: 200,
        description: 'History stats retrieved successfully',
        type: Object,
    })
    async getHistoryStats(@Req() req: AuthenticatedRequest) {
        return this.examAttemptService.getHistoryStats(req.user, forwardUser(req));
    }

    // ==================== NEW QUIZ ENDPOINTS ====================

    @Post('start')
    @RequirePermissions('exam:take')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({
        summary: 'Start or resume an exam attempt (with retry limit check)',
    })
    @ApiResponse({
        status: 201,
        description: 'Exam attempt started or resumed successfully',
        type: Object,
    })
    async startExamAttempt(
        @Req() req: AuthenticatedRequest,
        @Body() dto: CreateExamAttemptDto
    ) {
        return this.examAttemptService.startExamAttempt(req.user, dto);
    }

    @Put(':id/progress')
    @RequirePermissions('exam:take')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Update exam attempt progress (auto-save)' })
    @ApiParam({ name: 'id', description: 'Exam attempt ID' })
    @ApiResponse({
        status: 200,
        description: 'Progress updated successfully',
        type: Object,
    })
    async updateExamAttemptProgress(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string,
        @Body() dto: UpdateProgressDto
    ) {
        return this.examAttemptService.updateExamAttemptProgress(
            id,
            req.user,
            dto
        );
    }

    @Post(':id/submit')
    @RequirePermissions('exam:take')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Submit exam attempt and calculate score' })
    @ApiParam({ name: 'id', description: 'Exam attempt ID' })
    @ApiResponse({
        status: 200,
        description: 'Exam attempt submitted successfully',
        type: Object,
    })
    async submitExamAttempt(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string
    ) {
        return this.examAttemptService.submitExamAttempt(id, req.user);
    }

    @Get(':id/quiz')
    @RequirePermissions('exam:take')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Get exam attempt with questions for quiz view' })
    @ApiParam({ name: 'id', description: 'Exam attempt ID' })
    @ApiResponse({
        status: 200,
        description: 'Exam attempt with questions retrieved successfully',
        type: Object,
    })
    async getExamAttemptForQuiz(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string
    ) {
        return this.examAttemptService.getExamAttemptForQuiz(id, req.user);
    }

    // ==================== SECURE QUIZ ENDPOINTS ====================

    @Get(':id/secure-quiz')
    @RequirePermissions('exam:take')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({
        summary: 'Get exam attempt with encrypted questions and JWT tokens',
    })
    @ApiParam({ name: 'id', description: 'Exam attempt ID' })
    @ApiResponse({
        status: 200,
        description: 'Secure quiz data with encrypted questions',
        type: Object,
    })
    async getSecureQuizQuestions(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string
    ) {
        return this.examAttemptService.getSecureQuizQuestions(id, req.user);
    }

    @Post(':id/secure-submit')
    @RequirePermissions('exam:take')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({
        summary: 'Submit exam attempt with JWT token verification',
    })
    @ApiParam({ name: 'id', description: 'Exam attempt ID' })
    @ApiResponse({
        status: 200,
        description: 'Exam submitted with score calculation',
        type: Object,
    })
    async submitSecureExamAttempt(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string,
        @Body() dto: SecureSubmitDto
    ) {
        return this.examAttemptService.submitSecureExamAttempt(
            id,
            req.user,
            dto.answers
        );
    }

    @Get('list-by-room/:examRoomId')
    @RequirePermissions('exam_result:view')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({
        summary: 'Get all exam attempts for an exam room (owner only)',
    })
    @ApiParam({ name: 'examRoomId', description: 'Exam room ID' })
    @ApiResponse({
        status: 200,
        description: 'List of exam attempts with user details',
        type: Object,
    })
    async getExamAttemptsByRoom(
        @Req() req: AuthenticatedRequest,
        @Param('examRoomId') examRoomId: string,
        @Query('page', new QueryIntPipe()) page: string = '1',
        @Query('limit', new QueryIntPipe({ max: 100 })) limit: string = '10',
        @Query('distinctUser') distinctUser: string = 'false'
    ) {
        return this.examAttemptService.getExamAttemptsByRoom(
            examRoomId,
            req.user,
            parseInt(page, 10) || 1,
            parseInt(limit, 10) || 10,
            distinctUser === 'true'
        );
    }

    @Get('list-by-session/:sessionId')
    @RequirePermissions('exam_result:view')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({
        summary: 'Get all exam attempts for a session (owner only)',
    })
    @ApiParam({ name: 'sessionId', description: 'Exam session ID' })
    @ApiResponse({
        status: 200,
        description:
            'List of exam attempts with user details and violation count',
        type: Object,
    })
    async getExamAttemptsBySession(
        @Req() req: AuthenticatedRequest,
        @Param('sessionId') sessionId: string,
        @Query('page', new QueryIntPipe()) page: string = '1',
        @Query('limit', new QueryIntPipe({ max: 200 })) limit: string = '50',
        @Query('distinctUser') distinctUser: string = 'false'
    ) {
        return this.examAttemptService.getExamAttemptsBySession(
            sessionId,
            req.user,
            parseInt(page, 10) || 1,
            parseInt(limit, 10) || 50,
            distinctUser === 'true'
        );
    }

    @Get(':id/detail')
    @Authenticated()
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({
        summary: 'Get exam attempt details for slider view (owner only)',
    })
    @ApiParam({ name: 'id', description: 'Exam attempt ID' })
    @ApiResponse({
        status: 200,
        description: 'Exam attempt details',
        type: Object,
    })
    async getExamAttemptDetail(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string
    ) {
        return this.examAttemptService.getExamAttemptDetailForSlider(
            id,
            req.user
        );
    }

    // ==================== EXISTING ENDPOINTS ====================

    @Post()
    @RequirePermissions('exam:take')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Start a new exam attempt' })
    @ApiResponse({
        status: 201,
        description: 'Exam attempt created successfully',
        type: Object,
    })
    async createExamAttempt(
        @Req() req: AuthenticatedRequest,
        @Body() createExamAttemptDto: CreateExamAttemptDto
    ) {
        return this.examAttemptService.createExamAttempt(
            req.user,
            createExamAttemptDto
        );
    }

    @Get('get-by-id/:id')
    @Authenticated()
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Get an exam attempt by ID' })
    @ApiParam({ name: 'id', description: 'Exam attempt ID' })
    @ApiResponse({
        status: 200,
        description: 'Exam attempt retrieved successfully',
        type: Object,
    })
    async getExamAttemptById(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string
    ) {
        return this.examAttemptService.getExamAttemptById(id, req.user);
    }

    @Put(':id')
    @Authenticated()
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Update an exam attempt by ID' })
    @ApiParam({ name: 'id', description: 'Exam attempt ID' })
    @ApiResponse({
        status: 200,
        description: 'Exam attempt updated successfully',
        type: Object,
    })
    async updateExamAttempt(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string,
        @Body() updateExamAttemptDto: UpdateExamAttemptDto
    ) {
        return this.examAttemptService.updateExamAttempt(
            id,
            req.user,
            updateExamAttemptDto
        );
    }

    @Get('list')
    @RequirePermissions('exam:take')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Get a list of exam attempts' })
    @ApiResponse({
        status: 200,
        description: 'Exam attempts retrieved successfully',
        type: [Object],
    })
    async getExamAttempts(
        @Req() req: AuthenticatedRequest,
        @Query() getExamAttemptsDto: GetExamAttemptsDto
    ) {
        return this.examAttemptService.getExamAttempts(
            req.user,
            getExamAttemptsDto
        );
    }

    @Delete(':id')
    @RequirePermissions('exam_session:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Delete an exam attempt by ID' })
    @ApiParam({ name: 'id', description: 'Exam attempt ID' })
    @ApiResponse({
        status: 200,
        description: 'Exam attempt deleted successfully',
        type: Object,
    })
    async deleteExamAttempt(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string
    ) {
        return this.examAttemptService.deleteExamAttempt(id, req.user);
    }
}
