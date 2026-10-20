import { QueryIntPipe } from '../common/query-schema';
import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { StudentService } from './student.service';
import { AuthenticatedRequest } from '@examio/common';
import { RequirePermissions } from '@examio/auth-jwt';

@ApiTags('Student')
@Controller('student')
@ApiBearerAuth('access-token')
export class StudentController {
    constructor(private readonly studentService: StudentService) {}

    @Get('recent-flashcards')
    @RequirePermissions('flashcard:study')
    @ApiOperation({ summary: 'Get recent flashcard sets viewed by student' })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'page', required: false, type: Number })
    async getRecentFlashcards(
        @Req() req: AuthenticatedRequest,
        @Query('limit', new QueryIntPipe({ max: 100 })) limit?: string,
        @Query('page', new QueryIntPipe()) page?: string
    ) {
        const parsedLimit = limit ? parseInt(limit, 10) : 10;
        const parsedPage = page ? parseInt(page, 10) : 1;
        return this.studentService.getRecentFlashcards(req.user.id, parsedLimit, parsedPage);
    }

    @Get('recent-exams')
    @RequirePermissions('exam:take')
    @ApiOperation({ summary: 'Get recent exam attempts by student' })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'page', required: false, type: Number })
    async getRecentExams(
        @Req() req: AuthenticatedRequest,
        @Query('limit', new QueryIntPipe({ max: 100 })) limit?: string,
        @Query('page', new QueryIntPipe()) page?: string
    ) {
        const parsedLimit = limit ? parseInt(limit, 10) : 10;
        const parsedPage = page ? parseInt(page, 10) : 1;
        return this.studentService.getRecentExams(req.user.id, parsedLimit, parsedPage);
    }

    @Post('pin-flashcard/:id')
    @RequirePermissions('flashcard:study')
    @ApiOperation({ summary: 'Toggle pin/unpin a flashcard set for the current user' })
    @ApiParam({ name: 'id', description: 'Flashcard set ID' })
    async togglePinFlashcard(
        @Req() req: AuthenticatedRequest,
        @Param('id') flashcardSetId: string
    ) {
        return this.studentService.togglePinFlashcard(req.user.id, flashcardSetId);
    }

    @Post('pin-exam-room/:id')
    @RequirePermissions('exam:take')
    @ApiOperation({ summary: 'Toggle pin/unpin an exam room for the current user' })
    @ApiParam({ name: 'id', description: 'Exam room ID' })
    async togglePinExamRoom(
        @Req() req: AuthenticatedRequest,
        @Param('id') examRoomId: string
    ) {
        return this.studentService.togglePinExamRoom(req.user.id, examRoomId);
    }
}
