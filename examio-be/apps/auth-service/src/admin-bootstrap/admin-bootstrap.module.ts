import { DynamicModule, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { GenerateIdService, PasswordService } from '@examio/common';
import { RolesModule } from '../roles/roles.module';
import { AdminBootstrapService } from './admin-bootstrap.service';

/** Boot-time `ADMIN_EMAILS` sync. A failure is logged, never fatal for the host service. */
@Injectable()
class AdminBootstrapOnBoot implements OnModuleInit {
    private readonly logger = new Logger('AdminBootstrap');

    constructor(private readonly bootstrap: AdminBootstrapService) {}

    async onModuleInit(): Promise<void> {
        try {
            const r = await this.bootstrap.syncAdmins();
            this.logger.log(
                `sync complete: total=${r.total} created=${r.created} granted=${r.granted} skipped=${r.skipped} errors=${r.errors}`
            );
        } catch (err) {
            this.logger.error(`Admin bootstrap failed (non-fatal): ${(err as Error).message}`);
        }
    }
}

@Module({})
export class AdminBootstrapModule {
    /** `syncOnBoot: false` for the CLI: `revoke` must not be undone by a sync on start-up. */
    static forRoot(options: { syncOnBoot: boolean }): DynamicModule {
        return {
            module: AdminBootstrapModule,
            imports: [PrismaModule, RolesModule],
            providers: [
                AdminBootstrapService,
                PasswordService,
                GenerateIdService,
                ...(options.syncOnBoot ? [AdminBootstrapOnBoot] : []),
            ],
            exports: [AdminBootstrapService],
        };
    }
}
