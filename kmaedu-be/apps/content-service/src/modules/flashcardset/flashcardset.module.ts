import { Module } from '@nestjs/common';
import { R2DeleteTaskWriter } from '@kmaedu/messaging';
import { FlashcardsetService } from './flashcardset.service';
import { FlashcardsetController } from './flashcardset.controller';
import { PrismaService } from '../../prisma';
import { GenerateIdService, TurnstileService } from '@kmaedu/common';
import { GrpcClientModule } from '@kmaedu/grpc';
import { RedisService } from '@kmaedu/redis';
import { R2_GRPC_REGISTRATION, R2Client } from '../../clients/r2.client';
import { FlashCardSetRepository } from './flashcardset.repository';
import { FlashcardSetOwnerResolver } from './flashcardset-owner.resolver';
import { UserSearchService } from '../common/user-search.service';
import { VOCABULARY_GRPC_REGISTRATION, VocabularyClient } from '../../clients/vocabulary.client';
import { WordFamilyToFlashcardController } from './word-family-to-flashcard.controller';
import { WordFamilyToFlashcardService } from './word-family-to-flashcard.service';

@Module({
    imports: [
        GrpcClientModule.register(R2_GRPC_REGISTRATION, VOCABULARY_GRPC_REGISTRATION),
    ],
    providers: [
        PrismaService,
        RedisService,
        FlashcardsetService,
        GenerateIdService,
        R2Client,
        R2DeleteTaskWriter,
        FlashCardSetRepository,
        TurnstileService,
        FlashcardSetOwnerResolver,
        UserSearchService,
        VocabularyClient,
        WordFamilyToFlashcardService,
    ],
    controllers: [FlashcardsetController, WordFamilyToFlashcardController],
    exports: [FlashcardsetService, FlashCardSetRepository],
})
export class FlashcardSetModule {}
