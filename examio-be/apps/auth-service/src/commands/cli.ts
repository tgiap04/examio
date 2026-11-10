import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'path';

// Load .env from the auth-service directory before anything else.
config({ path: join(process.cwd(), 'apps', 'auth-service', '.env') });

import { NestFactory } from '@nestjs/core';
import { Logger, Module } from '@nestjs/common';
import { Command } from 'commander';
import { PrismaModule } from '../prisma';
import { AdminBootstrapModule } from '../admin-bootstrap/admin-bootstrap.module';
import { AdminBootstrapService } from '../admin-bootstrap/admin-bootstrap.service';

/** Standalone context: DB + RoleChangeService only (no HTTP, no broker, no sync on start). */
@Module({
    imports: [PrismaModule, AdminBootstrapModule.forRoot({ syncOnBoot: false })],
})
class CliModule {}

/**
 * Support / bootstrap CLI. Every change goes through RoleChangeService
 * (source "cli"): advisory lock, last-admin guard, RoleChangeLog, outbox event.
 *
 *   bootstrap:admin                       sync ADMIN_EMAILS
 *   bootstrap:admin list                  list SYSTEM_ADMIN accounts
 *   bootstrap:admin grant <email> [--teacher]
 *   bootstrap:admin revoke <email>
 *
 * Re-running `grant` with the same values re-emits `auth.user.authz_changed`
 * (forced re-apply): the recovery path when a downstream (finance wallet) missed it.
 */
async function withService<T>(
    run: (service: AdminBootstrapService) => Promise<T>
): Promise<T> {
    const app = await NestFactory.createApplicationContext(CliModule, {
        logger: ['log', 'error', 'warn'],
    });
    try {
        return await run(app.get(AdminBootstrapService));
    } finally {
        await app.close();
    }
}

async function main(): Promise<void> {
    const logger = new Logger('AdminBootstrapCLI');
    const program = new Command();
    program
        .name('bootstrap:admin')
        .description('Sync / list / grant / revoke SYSTEM_ADMIN accounts');

    program
        .command('sync', { isDefault: true })
        .description('Sync admins from ADMIN_EMAILS (idempotent create / grant)')
        .action(async () => {
            const r = await withService((s) => s.syncAdmins());
            logger.log(
                `sync complete: total=${r.total} created=${r.created} granted=${r.granted} skipped=${r.skipped} errors=${r.errors}`
            );
            for (const e of r.results.filter((x) => x.action === 'error')) {
                logger.error(`  - ${e.email}: ${e.error ?? 'unknown'}`);
            }
            process.exitCode = r.errors > 0 ? 1 : 0;
        });

    program
        .command('list')
        .description('List all SYSTEM_ADMIN accounts')
        .action(async () => {
            const admins = await withService((s) => s.listAdmins());
            if (admins.length === 0) logger.log('No SYSTEM_ADMIN users found.');
            for (const a of admins) {
                logger.log(
                    `  - ${a.email} (id=${a.id} role=${a.role} verified=${a.isVerified} createdAt=${a.createdAt.toISOString()})`
                );
            }
        });

    program
        .command('grant <email>')
        .option('--teacher', 'also make the account a TEACHER')
        .description('Grant SYSTEM_ADMIN to an existing user')
        .action(async (email: string, opts: { teacher?: boolean }) => {
            try {
                const user = await withService((s) => s.grant(email, opts));
                if (!user) {
                    logger.error(`User not found: ${email}`);
                    process.exitCode = 2;
                    return;
                }
                logger.log(`Granted: ${user.email} (id=${user.id})`);
            } catch (err) {
                logger.error(`Grant failed: ${(err as Error).message}`);
                process.exitCode = 1;
            }
        });

    program
        .command('revoke <email>')
        .description('Revoke SYSTEM_ADMIN from a user (the last admin is protected)')
        .action(async (email: string) => {
            try {
                const user = await withService((s) => s.revoke(email));
                if (!user) {
                    logger.error(`User not found: ${email}`);
                    process.exitCode = 2;
                    return;
                }
                logger.log(`Revoked: ${user.email} (id=${user.id})`);
            } catch (err) {
                logger.error(`Revoke failed: ${(err as Error).message}`);
                process.exitCode = 1;
            }
        });

    await program.parseAsync(process.argv);
}

main().catch((err) => {
    console.error('bootstrap:admin CLI failed:', err);
    process.exit(1);
});
