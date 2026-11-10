import { QueryIntPipe } from '../common/query-schema';
import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { StudentContentService } from './student-content.service';
import { AuthenticatedRequest } from '@examio/common';
import { RequirePermissions } from '@examio/auth-jwt';

@ApiTags('Student')
@Controller('student')
@ApiBearerAuth('access-token')
export class StudentContentController {
    constructor(private readonly studentContent: StudentContentService) {}

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
        return this.studentContent.getRecentFlashcards(req.user.id, parsedLimit, parsedPage);
    }

    @Post('pin-flashcard/:id')
    @RequirePermissions('flashcard:study')
    @ApiOperation({ summary: 'Toggle pin/unpin a flashcard set for the current user' })
    @ApiParam({ name: 'id', description: 'Flashcard set ID' })
    async togglePinFlashcard(
        @Req() req: AuthenticatedRequest,
        @Param('id') flashcardSetId: string
    ) {
        return this.studentContent.togglePinFlashcard(req.user.id, flashcardSetId);
    }
}
