import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@examio/database';
import {
    GenerateIdService,
    PasswordService,
} from '@examio/common';

import {
    BootstrapAction,
    BootstrapEmailResult,
    BootstrapResult,
} from './bootstrap.types';

/**
 * AdminBootstrapService — idempotent bootstrap of admin accounts
 * driven by env on module init.
 *
 * Env:
 *   - ADMIN_EMAILS           : CSV of admin emails (lowercased, trimmed, deduped)
 *   - ADMIN_DEFAULT_PASSWORD : default password applied to created users
 *
 * Per email:
 *   - user exists AND isAdmin === true   -> skip
 *   - user exists AND isAdmin === false  -> grant (set isAdmin = true)
 *   - user does NOT exist                -> create with isAdmin + isVerified = true
 *
 * All create/grant mutations run inside a single `prisma.$transaction([])`
 * so partial failure rolls back. Outer try/catch in `onModuleInit` ensures
 * bootstrap failure does NOT crash the host service. Passwords are
 * never logged in plaintext.
 *
 * For manual list / grant / revoke, see AdminManagementService.
 */
@Injectable()
export class AdminBootstrapService implements OnModuleInit {
    private readonly logger = new Logger(AdminBootstrapService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly passwordService: PasswordService,
        private readonly generateId: GenerateIdService
    ) {}

    async onModuleInit(): Promise<void> {
        try {
            const result = await this.syncAdmins();
            this.logger.log(
                `Admin bootstrap complete: total=${result.total} created=${result.created} granted=${result.granted} skipped=${result.skipped} errors=${result.errors}`
            );
        } catch (err) {
            this.logger.error(
                `Admin bootstrap failed (non-fatal): ${(err as Error).message}`
            );
        }
    }

    /**
     * Sync all admins defined in ADMIN_EMAILS env. Idempotent.
     */
    async syncAdmins(): Promise<BootstrapResult> {
        const emails = this.parseEmails(process.env.ADMIN_EMAILS);
        const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD;

        if (emails.length === 0) {
            this.logger.warn(
                'ADMIN_EMAILS is empty — skipping admin bootstrap'
            );
            return this.emptyResult();
        }

        if (!defaultPassword) {
            this.logger.warn(
                'ADMIN_DEFAULT_PASSWORD is not set — cannot create new admin users (existing users will still be granted)'
            );
        } else if (defaultPassword.length < 8) {
            this.logger.warn(
                'ADMIN_DEFAULT_PASSWORD is shorter than 8 chars — consider a longer secret'
            );
        }

        // First pass: gather intended actions without writing.
        const intentions = await this.collectIntentions(emails);

        // Second pass: execute mutations in a single transaction.
        const { results, executedByEmail } =
            await this.executeMutations(intentions, defaultPassword);

        // Compose final per-email results.
        this.composeResults(intentions, results, executedByEmail, defaultPassword);

        return this.summarize(intentions, results);
    }

    private emptyResult(): BootstrapResult {
        return {
            total: 0,
            created: 0,
            granted: 0,
            skipped: 0,
            errors: 0,
            results: [],
        };
    }

    /**
     * Parse + dedupe + validate emails from env.
     */
    private parseEmails(raw: string | undefined): string[] {
        if (!raw) return [];
        const seen = new Set<string>();
        const out: string[] = [];
        for (const piece of raw.split(',')) {
            const email = piece.trim().toLowerCase();
            if (!email) continue;
            if (!this.isValidEmail(email)) {
                this.logger.warn(
                    `Skipping invalid email in ADMIN_EMAILS: ${email}`
                );
                continue;
            }
            if (seen.has(email)) continue;
            seen.add(email);
            out.push(email);
        }
        return out;
    }

    private isValidEmail(email: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    private async collectIntentions(
        emails: string[]
    ): Promise<Array<{ email: string; action: BootstrapAction; userId?: string }>> {
        const intentions: Array<{
            email: string;
            action: BootstrapAction;
            userId?: string;
        }> = [];
        for (const email of emails) {
            try {
                const user = await this.prisma.user.findUnique({
                    where: { email },
                    select: { id: true, isAdmin: true },
                });
                if (!user) {
                    intentions.push({ email, action: 'create' });
                } else if (user.isAdmin === true) {
                    intentions.push({ email, action: 'skip', userId: user.id });
                } else {
                    intentions.push({ email, action: 'grant', userId: user.id });
                }
            } catch (err) {
                this.logger.error(
                    `Lookup failed for ${email}: ${(err as Error).message}`
                );
                intentions.push({ email, action: 'error' });
            }
        }
        return intentions;
    }

    private async executeMutations(
        intentions: Array<{ email: string; action: BootstrapAction; userId?: string }>,
        defaultPassword: string | undefined
    ): Promise<{
        results: BootstrapEmailResult[];
        executedByEmail: Map<string, { id: string }>;
    }> {
        const results: BootstrapEmailResult[] = [];
        const toMutate = intentions.filter(
            (i) => i.action === 'create' || i.action === 'grant'
        );

        let txResult: Array<{ id: string; email: string }> = [];
        if (toMutate.length > 0) {
            try {
                txResult = (await this.prisma.$transaction(
                    async (tx) => {
                        const out: Array<{ id: string; email: string }> = [];
                        for (const intent of toMutate) {
                            if (intent.action === 'grant' && intent.userId) {
                                const row = await tx.user.update({
                                    where: { id: intent.userId },
                                    data: { isAdmin: true },
                                });
                                out.push({
                                    id: row.id,
                                    email: row.email,
                                });
                            } else {
                                // create
                                if (!defaultPassword) {
                                    throw new Error(
                                        `ADMIN_DEFAULT_PASSWORD missing — cannot create ${intent.email}`
                                    );
                                }
                                const id = this.generateId.generateId();
                                const hashed =
                                    await this.passwordService.hashPassword(
                                        defaultPassword
                                    );
                                const row = await tx.user.create({
                                    data: {
                                        id,
                                        email: intent.email,
                                        username:
                                            intent.email.split('@')[0] +
                                            '_admin',
                                        isAdmin: true,
                                        isVerified: true,
                                        password: hashed,
                                        name: 'Admin',
                                        createdBy: 'system.bootstrap',
                                    },
                                });
                                out.push({
                                    id: row.id,
                                    email: row.email,
                                });
                            }
                        }
                        return out;
                    }
                )) as Array<{ id: string; email: string }>;
            } catch (err) {
                this.logger.error(
                    `Admin bootstrap transaction failed: ${(err as Error).message}`
                );
                for (const intent of intentions) {
                    if (
                        intent.action === 'create' ||
                        intent.action === 'grant'
                    ) {
                        results.push({
                            email: intent.email,
                            action: 'error',
                            error: (err as Error).message,
                        });
                    }
                }
            }
        }

        const executedByEmail = new Map<string, { id: string }>();
        for (const row of txResult) {
            if (row?.email) {
                executedByEmail.set(row.email, { id: row.id });
            }
        }
        return { results, executedByEmail };
    }

    private composeResults(
        intentions: Array<{ email: string; action: BootstrapAction; userId?: string }>,
        results: BootstrapEmailResult[],
        executedByEmail: Map<string, { id: string }>,
        defaultPassword: string | undefined
    ): void {
        for (const intent of intentions) {
            if (intent.action === 'skip') {
                this.logger.log(
                    `Admin already up-to-date: ${intent.email} (id=${intent.userId})`
                );
                results.push({
                    email: intent.email,
                    action: 'skip',
                    userId: intent.userId,
                });
                continue;
            }
            if (intent.action === 'error') {
                results.push({
                    email: intent.email,
                    action: 'error',
                    error: 'lookup failed',
                });
                continue;
            }
            const executed = executedByEmail.get(intent.email);
            if (!executed) {
                if (intent.action === 'create' && !defaultPassword) {
                    results.push({
                        email: intent.email,
                        action: 'error',
                        error: 'ADMIN_DEFAULT_PASSWORD missing',
                    });
                }
                continue;
            }
            if (intent.action === 'create') {
                this.logger.log(
                    `Created admin user: ${intent.email} (id=${executed.id})`
                );
            } else if (intent.action === 'grant') {
                this.logger.log(
                    `Granted isAdmin to existing user: ${intent.email} (id=${executed.id})`
                );
            }
            results.push({
                email: intent.email,
                action: intent.action,
                userId: executed.id,
            });
        }
    }

    private summarize(
        intentions: Array<{ email: string; action: BootstrapAction }>,
        results: BootstrapEmailResult[]
    ): BootstrapResult {
        return {
            total: intentions.length,
            created: results.filter((r) => r.action === 'create').length,
            granted: results.filter((r) => r.action === 'grant').length,
            skipped: results.filter((r) => r.action === 'skip').length,
            errors: results.filter((r) => r.action === 'error').length,
            results,
        };
    }
}
