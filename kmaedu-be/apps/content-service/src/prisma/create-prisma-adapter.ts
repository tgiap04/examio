import { PrismaPg } from '@prisma/adapter-pg';

/** Max connections of this process's pool (Postgres `max_connections=200` budget). */
export const PRISMA_POOL_MAX = 5;

/**
 * Builds the driver adapter for `DATABASE_URL`
 * (`postgresql://<svc>_svc:***@host:5432/kmaedu?schema=<svc>`).
 * `?schema=` qualifies the SQL Prisma generates; the pg driver must not see it.
 * Raw SQL (outbox relay, stats) resolves tables through the role's `search_path`.
 */
export function createPrismaAdapter(
    databaseUrl: string | undefined = process.env.DATABASE_URL
): PrismaPg {
    if (!databaseUrl) {
        throw new Error('DATABASE_URL is required to create the Prisma client');
    }
    const url = new URL(databaseUrl);
    const schema = url.searchParams.get('schema') ?? undefined;
    url.searchParams.delete('schema');
    return new PrismaPg(
        { connectionString: url.toString(), max: PRISMA_POOL_MAX },
        schema ? { schema } : undefined
    );
}
