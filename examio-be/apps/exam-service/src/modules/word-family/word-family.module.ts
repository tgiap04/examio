import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from '@examio/database';
import { AuthModule } from '@examio/common';
import { WordFamilyController } from './word-family.controller';
import { WordFamilyService } from './word-family.service';
import { WordFamilyBridgeService } from './word-family-bridge.service';
import { WordFamilyRepository } from './word-family.repository';

@Module({
    imports: [DatabaseModule, AuthModule, HttpModule],
    controllers: [WordFamilyController],
    providers: [
        WordFamilyService,
        WordFamilyBridgeService,
        WordFamilyRepository,
    ],
    exports: [WordFamilyService, WordFamilyRepository],
})
export class WordFamilyModule {}
