import { Module } from '@nestjs/common';

import { GrpcClientModule } from '@kmaedu/grpc';

import { AdminCommonModule } from '../../common/admin-common.module';
import { VOCABULARY_GRPC_REGISTRATION, VocabularyClient } from '../../clients/vocabulary.client';
import { AdminWordFamilyController } from './admin-word-family.controller';
import { AdminWordFamilyService } from './admin-word-family.service';

@Module({
    imports: [AdminCommonModule, GrpcClientModule.register(VOCABULARY_GRPC_REGISTRATION)],
    controllers: [AdminWordFamilyController],
    providers: [AdminWordFamilyService, VocabularyClient],
    exports: [AdminWordFamilyService],
})
export class AdminWordFamilyModule {}
