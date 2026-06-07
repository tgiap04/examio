import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'path';

// Load .env from admin-service directory before anything else.
config({ path: join(process.cwd(), 'apps', 'admin-service', '.env') });

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Command } from 'commander';

import { AdminBootstrapModule } from '../modules/admin-bootstrap/admin-bootstrap.module';
import { AdminBootstrapService } from '../modules/admin-bootstrap/admin-bootstrap.service';
import { AdminManagementService } from '../modules/admin-bootstrap/admin-management.service';

/**
 * Standalone CLI for admin bootstrap operations.
 *
 * Subcommands:
 *   bootstrap:admin                  -> sync all admins from ADMIN_EMAILS env
 *   bootstrap:admin list             -> list all current admin users
 *   bootstrap:admin grant <email>    -> manually grant isAdmin
 *   bootstrap:admin revoke <email>   -> manually revoke isAdmin
 *
 * Usage:
 *   node dist/apps/admin-service/commands/cli.js
 *   node dist/apps/admin-service/commands/cli.js list
 *   node dist/apps/admin-service/commands/cli.js grant alice@example.com
 */
async function main(): Promise<void> {
    const logger = new Logger('AdminBootstrapCLI');
    const program = new Command();

    program
        .name('bootstrap:admin')
        .description(
            'Sync / list / grant / revoke admin accounts (ADMIN_EMAILS env)'
        )
        .version('0.1.0');

    // Default action (no subcommand) -> sync
    program
        .command('sync', { isDefault: true })
        .description(
            'Sync admins from ADMIN_EMAILS env (idempotent create / grant)'
        )
        .action(async () => {
            const app = await NestFactory.createApplicationContext(
                AdminBootstrapModule,
                { logger: ['log', 'error', 'warn'] }
            );
            try {
                const service = app.get(AdminBootstrapService);
                const result = await service.syncAdmins();
                logger.log(
                    `sync complete: total=${result.total} created=${result.created} granted=${result.granted} skipped=${result.skipped} errors=${result.errors}`
                );
                if (result.errors > 0) {
                    for (const r of result.results) {
                        if (r.action === 'error') {
                            logger.error(
                                `  - ${r.email}: ${r.error ?? 'unknown'}`
                            );
                        }
                    }
                }
                process.exitCode = result.errors > 0 ? 1 : 0;
            } finally {
                await app.close();
            }
        });

    program
        .command('list')
        .description('List all users with isAdmin = true')
        .action(async () => {
            const app = await NestFactory.createApplicationContext(
                AdminBootstrapModule,
                { logger: ['error', 'warn'] }
            );
            try {
                const service = app.get(AdminManagementService);
                const admins = await service.listAdmins();
                if (admins.length === 0) {
                    logger.log('No admin users found.');
                } else {
                    logger.log(`Found ${admins.length} admin user(s):`);
                    for (const a of admins) {
                        logger.log(
                            `  - ${a.email} (id=${a.id} username=${a.username} verified=${a.isVerified} createdAt=${a.createdAt.toISOString()})`
                        );
                    }
                }
                process.exitCode = 0;
            } finally {
                await app.close();
            }
        });

    program
        .command('grant <email>')
        .description('Manually grant isAdmin to an existing user')
        .action(async (email: string) => {
            const app = await NestFactory.createApplicationContext(
                AdminBootstrapModule,
                { logger: ['log', 'error', 'warn'] }
            );
            try {
                const service = app.get(AdminManagementService);
                const result = await service.grantAdmin(email);
                if (!result) {
                    logger.error(`User not found: ${email}`);
                    process.exitCode = 2;
                    return;
                }
                logger.log(
                    `Granted: ${result.email} (id=${result.id}, isAdmin=${result.isAdmin})`
                );
                process.exitCode = 0;
            } catch (err) {
                logger.error(`Grant failed: ${(err as Error).message}`);
                process.exitCode = 1;
            } finally {
                await app.close();
            }
        });

    program
        .command('revoke <email>')
        .description('Manually revoke isAdmin from a user')
        .action(async (email: string) => {
            const app = await NestFactory.createApplicationContext(
                AdminBootstrapModule,
                { logger: ['log', 'error', 'warn'] }
            );
            try {
                const service = app.get(AdminManagementService);
                const result = await service.revokeAdmin(email);
                if (!result) {
                    logger.error(`User not found: ${email}`);
                    process.exitCode = 2;
                    return;
                }
                logger.log(
                    `Revoked: ${result.email} (id=${result.id}, isAdmin=${result.isAdmin})`
                );
                process.exitCode = 0;
            } catch (err) {
                logger.error(`Revoke failed: ${(err as Error).message}`);
                process.exitCode = 1;
            } finally {
                await app.close();
            }
        });

    await program.parseAsync(process.argv);
}

main().catch((err) => {
    // Last-ditch error handler — CLI must always exit cleanly.
    // eslint-disable-next-line no-console
    console.error('bootstrap:admin CLI failed:', err);
    process.exit(1);
});
