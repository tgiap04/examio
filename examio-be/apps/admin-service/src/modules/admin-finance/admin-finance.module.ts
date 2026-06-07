import { Module } from '@nestjs/common';
import { AdminGuard, AuthModule, GenerateIdService } from '@examio/common';

import { AdminCommonModule } from '../../common/admin-common.module';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminFinanceService } from './admin-finance.service';

@Module({
    imports: [AdminCommonModule, AuthModule],
    controllers: [AdminFinanceController],
    providers: [AdminFinanceService, GenerateIdService, AdminGuard],
    exports: [AdminFinanceService],
})
export class AdminFinanceModule {}
