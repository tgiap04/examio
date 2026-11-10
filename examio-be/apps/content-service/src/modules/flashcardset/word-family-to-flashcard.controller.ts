import { ZodValidationPipe } from 'nestjs-zod';
import { Body, Controller, Param, Post, Req, UsePipes } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '@examio/common';
import { RequirePermissions } from '@examio/auth-jwt';
import { WordFamilyToFlashcardService } from './word-family-to-flashcard.service';
import { ToFlashcardDto } from './dto/word-family-to-flashcard.dto';

/**
 * The word-family -> flashcard bridge writes a FlashCardSet, so it lives in content;
 * the word family itself is read from vocabulary-service. The gateway routes this exact
 * path to content before the `word-family` prefix.
 */
@UsePipes(ZodValidationPipe)
@ApiTags('Word Family')
@Controller('word-family')
export class WordFamilyToFlashcardController {
    constructor(private readonly service: WordFamilyToFlashcardService) {}

    @Post(':id/to-flashcard')
    @RequirePermissions('flashcardset:manage')
    @ApiCookieAuth('cookie-auth')
    @ApiOperation({ summary: 'Chuyển word family thành bộ flashcard' })
    @ApiParam({ name: 'id', description: 'Word Family ID' })
    async toFlashcard(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string,
        @Body() dto: ToFlashcardDto
    ) {
        return this.service.createFlashcardDeck(req.user, id, dto.selectedIndices);
    }
}
