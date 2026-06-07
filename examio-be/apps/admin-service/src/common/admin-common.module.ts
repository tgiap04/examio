import { Module } from '@nestjs/common';
import { DatabaseModule, PrismaService } from '@examio/database';

import { AuditWriterService } from './audit-writer.service';

/**
 * AdminCommonModule — shared providers used across admin-service modules
 * (audit writer, future helpers). Exports AuditWriterService so any
 * feature module (admin-finance, admin-users, ...) can inject it.
 */
@Module({
    imports: [DatabaseModule],
    providers: [AuditWriterService, PrismaService],
    exports: [AuditWriterService, PrismaService],
})
export class AdminCommonModule {}
