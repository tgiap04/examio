/**
 * exam-service (legacy schema) reference data seed: subject categories +
 * subjects (word-family categories live in vocabulary-service). Always
 * idempotent; `--dev` is accepted (and ignored) so `seed:dev` can pass it to every
 * service.
 *
 *   EXAM_DATABASE_URL=postgresql://exam_svc:***@127.0.0.1:5432/examio?schema=exam \
 *     ts-node --transpile-only apps/exam-service/prisma/seed.ts
 */
import { seedDatabaseUrl } from '../../../libs/common/src/seed/dev-seed-users';
import { createPrismaAdapter } from '../src/prisma/create-prisma-adapter';
import { PrismaClient } from '../src/generated/prisma/client';
import { seedSubjects } from './seed/subjects';

async function main(): Promise<void> {
    const prisma = new PrismaClient({ adapter: createPrismaAdapter(seedDatabaseUrl('EXAM')) });
    try {
        const { categories, subjects } = await seedSubjects(prisma);
        console.log(`exam seed: ${categories} subject categories, ${subjects} subjects`);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error('exam seed failed:', err instanceof Error ? err.message : err);
        process.exit(1);
    });
}
