import { Controller, Get, Post, Param, Body, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthenticatedRequest } from '@examio/common';
import { FlashcardStudyService } from './flashcard-study.service';
import { Authenticated } from '@examio/auth-jwt';

@ApiTags('Flashcard Study')
@Controller('flashcard-study')
@Authenticated()
@ApiBearerAuth('access-token')
export class FlashcardStudyController {
    constructor(private readonly flashcardStudyService: FlashcardStudyService) {}

    @Post('progress/:flashCardSetId')
    @ApiOperation({ summary: 'Save study progress for a flashcard set' })
    async saveProgress(
        @Req() req: AuthenticatedRequest,
        @Param('flashCardSetId') flashCardSetId: string,
        @Body() body: { studiedCardIds?: string[]; cardId?: string }
    ) {
        if (body.cardId) {
            return this.flashcardStudyService.addStudiedCard(
                req.user.id,
                flashCardSetId,
                body.cardId
            );
        }
        return this.flashcardStudyService.saveProgress(
            req.user.id,
            flashCardSetId,
            body.studiedCardIds || []
        );
    }

    @Get('progress/:flashCardSetId')
    @ApiOperation({ summary: 'Get study progress for a flashcard set' })
    async getProgress(
        @Req() req: AuthenticatedRequest,
        @Param('flashCardSetId') flashCardSetId: string
    ) {
        return this.flashcardStudyService.getProgress(req.user.id, flashCardSetId);
    }
}
