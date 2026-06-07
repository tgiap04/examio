import { Module } from '@nestjs/common';
import { DatabaseModule, PrismaService } from '@examio/database';
import { AdminGuard, AuthModule } from '@examio/common';

import { AdminAuditController } from './admin-audit.controller';
import { AdminAuditService } from './admin-audit.service';

@Module({
    imports: [DatabaseModule, AuthModule],
    controllers: [AdminAuditController],
    providers: [AdminAuditService, PrismaService, AdminGuard],
    exports: [AdminAuditService],
})
export class AdminAuditModule {}
