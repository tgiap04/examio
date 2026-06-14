import { Module } from '@nestjs/common';
import { AdminGuard, AuthModule } from '@examio/common';

import { AdminCommonModule } from '../../common/admin-common.module';
import { AdminWordFamilyController } from './admin-word-family.controller';
import { AdminWordFamilyService } from './admin-word-family.service';

@Module({
    imports: [AdminCommonModule, AuthModule],
    controllers: [AdminWordFamilyController],
    providers: [AdminWordFamilyService, AdminGuard],
    exports: [AdminWordFamilyService],
})
export class AdminWordFamilyModule {}
