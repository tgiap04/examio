import { SaveProgressDto } from './dto/progress.dto';
import { ZodValidationPipe } from 'nestjs-zod';
import { Controller, Get, Post, Param, Body, Req, UsePipes } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthenticatedRequest } from '@examio/common';
import { FlashcardStudyService } from './flashcard-study.service';
import { RequireOwnerOrPermission } from '@examio/auth-jwt';
import { FlashcardSetOwnerResolver } from '../flashcardset/flashcardset-owner.resolver';

@UsePipes(ZodValidationPipe)
@ApiTags('Flashcard Study')
@Controller('flashcard-study')
@ApiBearerAuth('access-token')
export class FlashcardStudyController {
    constructor(private readonly flashcardStudyService: FlashcardStudyService) {}

    @Post('progress/:flashCardSetId')
    @RequireOwnerOrPermission('flashcard:study', FlashcardSetOwnerResolver)
    @ApiOperation({ summary: 'Save study progress for a flashcard set' })
    async saveProgress(
        @Req() req: AuthenticatedRequest,
        @Param('flashCardSetId') flashCardSetId: string,
        @Body() body: SaveProgressDto
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
    @RequireOwnerOrPermission('flashcard:study', FlashcardSetOwnerResolver)
    @ApiOperation({ summary: 'Get study progress for a flashcard set' })
    async getProgress(
        @Req() req: AuthenticatedRequest,
        @Param('flashCardSetId') flashCardSetId: string
    ) {
        return this.flashcardStudyService.getProgress(req.user.id, flashCardSetId);
    }
}
