import { Module } from '@nestjs/common';
import { AdminGuard, AuthModule } from '@examio/common';

import { AdminCommonModule } from '../../common/admin-common.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
    imports: [AdminCommonModule, AuthModule],
    controllers: [AdminUsersController],
    providers: [AdminUsersService, AdminGuard],
    exports: [AdminUsersService],
})
export class AdminUsersModule {}
