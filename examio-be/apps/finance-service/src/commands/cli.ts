import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'path';

// Load .env from the finance-service directory before anything else.
config({ path: join(process.cwd(), 'apps', 'finance-service', '.env') });

import { NestFactory } from '@nestjs/core';
import { Logger, Module } from '@nestjs/common';
import { Command } from 'commander';
import { AuthJwtModule } from '@examio/auth-jwt';
import { GenerateIdService } from '@examio/common';
import { PrismaModule } from '../prisma';
import { GrpcClientModule } from '@examio/grpc';
import { AUTH_GRPC_REGISTRATION, AuthClient } from '../clients/auth.client';
import { EnsureWalletService } from '../modules/wallet/ensure-wallet.service';
import { ReconcileTeachers } from './reconcile-teachers';

@Module({
    imports: [
        PrismaModule,
        AuthJwtModule.forRoot({
            serviceName: 'finance',
            serviceClient: true,
            globalGuards: false,
        }),
        GrpcClientModule.register(AUTH_GRPC_REGISTRATION),
    ],
    providers: [AuthClient, EnsureWalletService, GenerateIdService, ReconcileTeachers],
})
class CliModule {}

/**
 *   finance reconcile-teachers   ensure a wallet for every TEACHER (recovery path)
 */
async function main(): Promise<void> {
    const logger = new Logger('FinanceCLI');
    const program = new Command();
    program.name('finance').description('Finance support commands');

    program
        .command('reconcile-teachers')
        .description('Ensure a wallet + Free subscription for every TEACHER in auth')
        .action(async () => {
            const app = await NestFactory.createApplicationContext(CliModule, {
                logger: ['log', 'error', 'warn'],
            });
            try {
                const { teachers, created } = await app.get(ReconcileTeachers).run();
                logger.log(`done: ${teachers} teacher(s) checked, ${created} wallet(s) created`);
            } catch (err) {
                logger.error(`reconcile-teachers failed: ${(err as Error).message}`);
                process.exitCode = 1;
            } finally {
                await app.close();
            }
        });

    await program.parseAsync(process.argv);
}

main().catch((err) => {
    console.error('finance CLI failed:', err);
    process.exit(1);
});
