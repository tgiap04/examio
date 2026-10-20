import { Module } from '@nestjs/common';
import { FlashcardStudyController } from './flashcard-study.controller';
import { FlashcardStudyService } from './flashcard-study.service';
import { DatabaseModule } from '@examio/database';
import { FlashcardSetOwnerResolver } from '../flashcardset/flashcardset-owner.resolver';

@Module({
    imports: [DatabaseModule],
    controllers: [FlashcardStudyController],
    providers: [FlashcardStudyService, FlashcardSetOwnerResolver],
    exports: [FlashcardStudyService],
})
export class FlashcardStudyModule {}
