import { Module } from '@nestjs/common';
import { FlashcardStudyController } from './flashcard-study.controller';
import { FlashcardStudyService } from './flashcard-study.service';
import { DatabaseModule } from '@examio/database';
import { AuthModule } from '@examio/common';

@Module({
    imports: [DatabaseModule, AuthModule],
    controllers: [FlashcardStudyController],
    providers: [FlashcardStudyService],
    exports: [FlashcardStudyService],
})
export class FlashcardStudyModule {}
