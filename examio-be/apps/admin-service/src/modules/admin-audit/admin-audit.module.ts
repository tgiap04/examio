import { Module } from '@nestjs/common';
import { DatabaseModule, PrismaService } from '@examio/database';

import { AdminAuditController } from './admin-audit.controller';
import { AdminAuditService } from './admin-audit.service';

@Module({
    imports: [DatabaseModule],
    controllers: [AdminAuditController],
    providers: [AdminAuditService, PrismaService],
    exports: [AdminAuditService],
})
export class AdminAuditModule {}
