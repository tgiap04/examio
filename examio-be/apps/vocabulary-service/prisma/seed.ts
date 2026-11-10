/**
 * vocabulary-service reference data seed: word-family categories. Idempotent
 * (upsert by slug); `--dev` is accepted (and ignored) so `seed:dev` can pass it
 * to every service.
 *
 *   VOCABULARY_DATABASE_URL=postgresql://vocabulary_svc:***@127.0.0.1:5432/examio?schema=vocabulary \
 *     ts-node --transpile-only apps/vocabulary-service/prisma/seed.ts
 */
import { createPrismaAdapter } from '../src/prisma/create-prisma-adapter';
import { PrismaClient } from '../src/generated/prisma/client';
import { seedWordFamilyCategories } from './seed/word-family-categories';

function databaseUrl(env: NodeJS.ProcessEnv = process.env): string {
    const url = env.VOCABULARY_DATABASE_URL ?? env.DATABASE_URL;
    if (!url) {
        throw new Error(
            'VOCABULARY_DATABASE_URL (or DATABASE_URL) is required to seed vocabulary-service'
        );
    }
    return url;
}

async function main(): Promise<void> {
    const prisma = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl()) });
    try {
        await seedWordFamilyCategories(prisma);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error('vocabulary seed failed:', err instanceof Error ? err.message : err);
        process.exit(1);
    });
}
