import { Module } from '@nestjs/common';
import { FlashcardStudyController } from './flashcard-study.controller';
import { FlashcardStudyService } from './flashcard-study.service';
import { PrismaModule } from '../../prisma';
import { FlashcardSetOwnerResolver } from '../flashcardset/flashcardset-owner.resolver';

@Module({
    imports: [PrismaModule],
    controllers: [FlashcardStudyController],
    providers: [FlashcardStudyService, FlashcardSetOwnerResolver],
    exports: [FlashcardStudyService],
})
export class FlashcardStudyModule {}
