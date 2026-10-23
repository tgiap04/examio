import { Module } from '@nestjs/common';
import { R2DeleteTaskWriter } from '@examio/messaging';
import { FlashcardsetService } from './flashcardset.service';
import { FlashcardsetController } from './flashcardset.controller';
import { PrismaService } from '../../prisma';
import { GenerateIdService, TurnstileService } from '@examio/common';
import { GrpcClientModule } from '@examio/grpc';
import { RedisService } from '@examio/redis';
import { R2_GRPC_REGISTRATION, R2Client } from '../../clients/r2.client';
import { FlashCardSetRepository } from './flashcardset.repository';
import { FlashcardSetOwnerResolver } from './flashcardset-owner.resolver';
import { UserSearchService } from '../common/user-search.service';

@Module({
    imports: [GrpcClientModule.register(R2_GRPC_REGISTRATION)],
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
    ],
    controllers: [FlashcardsetController],
    exports: [FlashcardsetService, FlashCardSetRepository],
})
export class FlashcardSetModule {}
