import { Module } from '@nestjs/common';

import { AdminCommonModule } from '../../common/admin-common.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
    imports: [AdminCommonModule],
    controllers: [AdminUsersController],
    providers: [AdminUsersService],
    exports: [AdminUsersService],
})
export class AdminUsersModule {}
