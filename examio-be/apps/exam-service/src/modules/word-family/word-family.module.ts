import { Module } from '@nestjs/common';
import { R2DeleteTaskWriter } from '@examio/messaging';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../../prisma';
import { WordFamilyController } from './word-family.controller';
import { WordFamilyService } from './word-family.service';
import { WordFamilyBridgeService } from './word-family-bridge.service';
import { WordFamilyRepository } from './word-family.repository';
import { WordFamilyAdminGrpcController } from './word-family-admin.grpc.controller';
import { R2_PUBLIC_BASE_URL, WordFamilyAdminService } from './word-family-admin.service';

@Module({
    imports: [PrismaModule, HttpModule],
    controllers: [WordFamilyController, WordFamilyAdminGrpcController],
    providers: [
        WordFamilyService,
        WordFamilyBridgeService,
        WordFamilyRepository,
        WordFamilyAdminService,
        R2DeleteTaskWriter,
        // Public base of R2 objects; unset => deleting an R2-hosted image fails loudly.
        { provide: R2_PUBLIC_BASE_URL, useFactory: () => process.env.R2_PUBLIC_URL ?? '' },
    ],
    exports: [WordFamilyService, WordFamilyRepository],
})
export class WordFamilyModule {}
