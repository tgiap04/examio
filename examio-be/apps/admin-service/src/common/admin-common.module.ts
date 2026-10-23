import { Module } from '@nestjs/common';
import { PrismaModule, PrismaService } from '../prisma';

import { AuditWriterService } from './audit-writer.service';

/**
 * AdminCommonModule — shared providers used across admin-service modules
 * (audit writer, future helpers). Exports AuditWriterService so any
 * feature module (admin-finance, admin-users, ...) can inject it.
 */
@Module({
    imports: [PrismaModule],
    providers: [AuditWriterService, PrismaService],
    exports: [AuditWriterService, PrismaService],
})
export class AdminCommonModule {}
