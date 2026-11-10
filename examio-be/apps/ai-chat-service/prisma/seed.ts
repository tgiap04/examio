/**
 * ai-chat-service reference data seed: subject categories + subjects (AI teachers). Idempotent
 * (upsert by slug); `--dev` is accepted (and ignored) so `seed:dev` can pass it to every service.
 *
 *   AICHAT_DATABASE_URL=postgresql://aichat_svc:***@127.0.0.1:5432/examio?schema=aichat \
 *     ts-node --transpile-only apps/ai-chat-service/prisma/seed.ts
 */
import { createPrismaAdapter } from '../src/prisma/create-prisma-adapter';
import { PrismaClient } from '../src/generated/prisma/client';
import { seedSubjects } from './seed/subjects';

function databaseUrl(env: NodeJS.ProcessEnv = process.env): string {
    const url = env.AICHAT_DATABASE_URL ?? env.DATABASE_URL;
    if (!url) {
        throw new Error('AICHAT_DATABASE_URL (or DATABASE_URL) is required to seed ai-chat-service');
    }
    return url;
}

async function main(): Promise<void> {
    const prisma = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl()) });
    try {
        const { categories, subjects } = await seedSubjects(prisma);
        console.log(`ai-chat seed: ${categories} subject categories, ${subjects} subjects`);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error('ai-chat seed failed:', err instanceof Error ? err.message : err);
        process.exit(1);
    });
}
