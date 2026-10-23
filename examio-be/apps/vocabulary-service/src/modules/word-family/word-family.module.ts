import { Module } from '@nestjs/common';
import { R2DeleteTaskWriter } from '@examio/messaging';
import { HttpModule } from '@nestjs/axios';
import { AiClient } from '../../clients/ai.client';
import { WordFamilyController } from './word-family.controller';
import { WordFamilyService } from './word-family.service';
import { WordFamilyRepository } from './word-family.repository';
import { WordFamilyAdminGrpcController } from './word-family-admin.grpc.controller';
import { WordFamilyGrpcController } from './word-family.grpc.controller';
import { WordFamilyLookupService } from './word-family-lookup.service';
import { R2_PUBLIC_BASE_URL, WordFamilyAdminService } from './word-family-admin.service';

@Module({
    imports: [HttpModule],
    controllers: [
        WordFamilyController,
        WordFamilyAdminGrpcController,
        WordFamilyGrpcController,
    ],
    providers: [
        AiClient,
        WordFamilyService,
        WordFamilyRepository,
        WordFamilyAdminService,
        WordFamilyLookupService,
        R2DeleteTaskWriter,
        // Public base of R2 objects; unset => deleting an R2-hosted image fails loudly.
        { provide: R2_PUBLIC_BASE_URL, useFactory: () => process.env.R2_PUBLIC_URL ?? '' },
    ],
    exports: [WordFamilyService, WordFamilyRepository],
})
export class WordFamilyModule {}
