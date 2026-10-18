import { Injectable, Logger } from '@nestjs/common';
import { authV1 } from '@examio/contracts';
import { AuthClient } from '../clients/auth.client';
import { EnsureWalletService } from '../modules/wallet/ensure-wallet.service';

const PAGE_SIZE = 100;

/** Pages auth `ListUsers(role=TEACHER)` and ensures a wallet per teacher. */
@Injectable()
export class ReconcileTeachers {
    private readonly logger = new Logger(ReconcileTeachers.name);

    constructor(
        private readonly auth: AuthClient,
        private readonly wallets: EnsureWalletService
    ) {}

    async run(): Promise<{ teachers: number; created: number }> {
        let page = 1;
        let teachers = 0;
        let created = 0;
        for (;;) {
            const res = await this.auth.listUsers({
                query: '',
                role: authV1.BaseRole.BASE_ROLE_TEACHER,
                page,
                limit: PAGE_SIZE,
            });
            for (const user of res.users) {
                teachers++;
                if ((await this.wallets.ensure(user.id)).created) created++;
            }
            // Trust the page size the server actually applied (it may cap ours).
            const applied = res.page?.limit || PAGE_SIZE;
            const total = res.page?.total ?? 0;
            if (res.users.length === 0 || page * applied >= total) break;
            page++;
        }
        this.logger.log(`reconcile-teachers: teachers=${teachers} created=${created}`);
        return { teachers, created };
    }
}
