import { Module } from '@nestjs/common';

import { AdminCommonModule } from '../../common/admin-common.module';
import { AdminWordFamilyController } from './admin-word-family.controller';
import { AdminWordFamilyService } from './admin-word-family.service';

@Module({
    imports: [AdminCommonModule],
    controllers: [AdminWordFamilyController],
    providers: [AdminWordFamilyService],
    exports: [AdminWordFamilyService],
})
export class AdminWordFamilyModule {}
