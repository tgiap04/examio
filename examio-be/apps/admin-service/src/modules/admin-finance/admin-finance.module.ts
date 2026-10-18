import { Module } from '@nestjs/common';
import { GenerateIdService } from '@examio/common';

import { AdminCommonModule } from '../../common/admin-common.module';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminFinanceService } from './admin-finance.service';

@Module({
    imports: [AdminCommonModule],
    controllers: [AdminFinanceController],
    providers: [AdminFinanceService, GenerateIdService],
    exports: [AdminFinanceService],
})
export class AdminFinanceModule {}
