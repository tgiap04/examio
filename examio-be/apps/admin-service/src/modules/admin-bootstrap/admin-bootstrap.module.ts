import { Module } from '@nestjs/common';
import { DatabaseModule } from '@examio/database';
import {
    GenerateIdService,
    PasswordService,
} from '@examio/common';

import { AdminBootstrapService } from './admin-bootstrap.service';
import { AdminManagementService } from './admin-management.service';

/**
 * AdminBootstrapModule — wires the bootstrap + management services
 * into the admin-service app. The OnModuleInit hook on
 * AdminBootstrapService fires on app start.
 *
 * Exports both services so the CLI command (in `src/commands/`) and
 * future admin controllers can resolve them from the same Nest container.
 */
@Module({
    imports: [DatabaseModule],
    providers: [
        AdminBootstrapService,
        AdminManagementService,
        PasswordService,
        GenerateIdService,
    ],
    exports: [AdminBootstrapService, AdminManagementService],
})
export class AdminBootstrapModule {}
