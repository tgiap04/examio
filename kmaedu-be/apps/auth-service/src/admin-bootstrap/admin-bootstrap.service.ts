import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { GenerateIdService, PasswordService } from '@kmaedu/common';
import {
    RoleChangeService,
    type RoleChangeActor,
    type RoleChangeSource,
} from '../roles/role-change.service';

export type BootstrapAction = 'create' | 'grant' | 'skip' | 'error';

export interface BootstrapEmailResult {
    email: string;
    action: BootstrapAction;
    userId?: string;
    error?: string;
}

export interface BootstrapResult {
    total: number;
    created: number;
    granted: number;
    skipped: number;
    errors: number;
    results: BootstrapEmailResult[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const systemActor = (name: string): RoleChangeActor => ({
    kind: 'system',
    email: `${name}@system`,
});

/**
 * SYSTEM_ADMIN bootstrap (ADMIN_EMAILS sync) and the support CLI
 * (list / grant / revoke). Every authz change goes through RoleChangeService
 * (advisory lock, last-admin guard, RoleChangeLog, `authz_changed` outbox
 * event); only the CLI/bootstrap system actor skips the actor-is-admin check.
 */
@Injectable()
export class AdminBootstrapService {
    private readonly logger = new Logger(AdminBootstrapService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly roles: RoleChangeService,
        private readonly passwords: PasswordService,
        private readonly ids: GenerateIdService
    ) {}

    listAdmins() {
        return this.prisma.user.findMany({
            where: { isSystemAdmin: true },
            select: {
                id: true,
                email: true,
                username: true,
                role: true,
                isSystemAdmin: true,
                isVerified: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    /**
     * Grants SYSTEM_ADMIN (and TEACHER with `teacher`). Re-running with the
     * same values writes a `reapply` log + re-emits `authz_changed`: the
     * support recovery path for a lost provisioning event.
     */
    async grant(email: string, options: { teacher?: boolean } = {}) {
        return this.applyByEmail(email, {
            isSystemAdmin: true,
            ...(options.teacher && { role: 'TEACHER' as const }),
        });
    }

    revoke(email: string) {
        return this.applyByEmail(email, { isSystemAdmin: false });
    }

    /** Idempotent sync of ADMIN_EMAILS: skip admins, grant members, create the missing. */
    async syncAdmins(): Promise<BootstrapResult> {
        const emails = this.parseEmails(process.env.ADMIN_EMAILS);
        if (emails.length === 0) {
            this.logger.warn('ADMIN_EMAILS is empty, skipping admin bootstrap');
            return { total: 0, created: 0, granted: 0, skipped: 0, errors: 0, results: [] };
        }
        const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD;
        if (!defaultPassword) {
            this.logger.warn('ADMIN_DEFAULT_PASSWORD is not set: new admin users cannot be created');
        }

        const existing = await this.prisma.user.findMany({
            where: { email: { in: emails } },
            select: { id: true, email: true, isSystemAdmin: true },
        });
        const byEmail = new Map(existing.map((u) => [u.email, u]));

        const results: BootstrapEmailResult[] = [];
        for (const email of emails) {
            results.push(await this.syncOne(email, byEmail.get(email), defaultPassword));
        }
        const count = (a: BootstrapAction) => results.filter((r) => r.action === a).length;
        return {
            total: results.length,
            created: count('create'),
            granted: count('grant'),
            skipped: count('skip'),
            errors: count('error'),
            results,
        };
    }

    private async syncOne(
        email: string,
        user: { id: string; isSystemAdmin: boolean } | undefined,
        defaultPassword: string | undefined
    ): Promise<BootstrapEmailResult> {
        try {
            if (user?.isSystemAdmin) return { email, action: 'skip', userId: user.id };
            let userId = user?.id;
            const created = !userId;
            if (created) {
                if (!defaultPassword) throw new Error('ADMIN_DEFAULT_PASSWORD missing');
                userId = await this.createAccount(email, defaultPassword);
            }
            await this.roles.change({
                actor: systemActor('bootstrap'),
                targetUserId: userId!,
                isSystemAdmin: true,
                source: 'bootstrap',
            });
            this.logger.log(`${created ? 'Created' : 'Granted'} SYSTEM_ADMIN: ${email}`);
            return { email, action: created ? 'create' : 'grant', userId };
        } catch (err) {
            this.logger.error(`Bootstrap failed for ${email}: ${(err as Error).message}`);
            return { email, action: 'error', error: (err as Error).message };
        }
    }

    /** STUDENT by default; the admin flag is applied afterwards through RoleChangeService. */
    private async createAccount(email: string, password: string): Promise<string> {
        const row = await this.prisma.user.create({
            data: {
                id: this.ids.generateId(),
                email,
                username: `${email.split('@')[0]}_admin`,
                isVerified: true,
                password: await this.passwords.hashPassword(password),
                name: 'Admin',
                createdBy: 'system.bootstrap',
            },
        });
        return row.id;
    }

    private async applyByEmail(
        rawEmail: string,
        change: { role?: 'STUDENT' | 'TEACHER'; isSystemAdmin?: boolean },
        source: RoleChangeSource = 'cli'
    ) {
        const email = rawEmail.trim().toLowerCase();
        if (!EMAIL.test(email)) throw new Error(`Invalid email: ${rawEmail}`);
        const user = await this.prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true },
        });
        if (!user) return null;
        const result = await this.roles.change({
            actor: systemActor('cli'),
            targetUserId: user.id,
            ...change,
            source,
        });
        this.logger.log(
            `${result.changed ? 'Applied' : 'Re-applied'} ${JSON.stringify(change)} to ${email}`
        );
        return user;
    }

    private parseEmails(raw: string | undefined): string[] {
        const out = new Set<string>();
        for (const piece of (raw ?? '').split(',')) {
            const email = piece.trim().toLowerCase();
            if (!email) continue;
            if (EMAIL.test(email)) out.add(email);
            else this.logger.warn(`Skipping invalid email in ADMIN_EMAILS: ${email}`);
        }
        return [...out];
    }
}
