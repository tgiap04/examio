import { spawnSync } from 'child_process';
import { join } from 'path';
import { Client } from 'pg';
import { APP_DIR, SEEDED, SERVICES, Service, assertLocal, describeWhenEnabled, urlOf, withDatabase } from './db-env';

/**
 * Fresh database -> `prisma migrate deploy` of every service as its own role ->
 * `migrate status` up to date and no drift -> seeds -> row counts of the pre-split seed.
 * Runs in a throwaway database created (and dropped) here through PRISMA_ADMIN_URL.
 */
const adminUrl = process.env.PRISMA_ADMIN_URL;
const enabled = Boolean(adminUrl) && SERVICES.every((s) => urlOf(s));
const describeDb = describeWhenEnabled(enabled, 'PRISMA_ADMIN_URL and the six service DATABASE_URLs');

const ROOT = join(__dirname, '..', '..');
const PRISMA = join(ROOT, 'node_modules', '.bin', 'prisma');
const dbName = `kmaedu_smoke_${Date.now().toString(36)}`;

const schemaPath = (svc: Service): string =>
    spawnSync(join(ROOT, 'scripts', 'prisma-schema-path.sh'), [svc], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();

const smokeUrl = (svc: Service) => withDatabase(urlOf(svc) as string, dbName);

function prisma(svc: Service, args: string[]) {
    return spawnSync(PRISMA, [...args, '--schema', schemaPath(svc)], {
        cwd: ROOT,
        encoding: 'utf8',
        // No shell env leaks in: the child only knows the throwaway database.
        env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: smokeUrl(svc) },
    });
}

function seed(svc: Service, ...flags: string[]) {
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, [`${svc.toUpperCase()}_DATABASE_URL`]: smokeUrl(svc) };
    return spawnSync(join(ROOT, 'node_modules', '.bin', 'ts-node'), ['--transpile-only', `apps/${APP_DIR[svc]}-service/prisma/seed.ts`, ...flags], {
        cwd: ROOT,
        encoding: 'utf8',
        env: env as NodeJS.ProcessEnv,
    });
}

async function count(svc: Service, table: string): Promise<number> {
    const u = new URL(smokeUrl(svc));
    u.searchParams.delete('schema');
    const client = new Client({ connectionString: u.toString() });
    await client.connect();
    try {
        return (await client.query(`SELECT count(*)::int AS n FROM ${svc}."${table}"`)).rows[0].n;
    } finally {
        await client.end();
    }
}

describeDb('migrations and seeds on a fresh database (e2e)', () => {
    let admin: Client;

    beforeAll(async () => {
        assertLocal(adminUrl as string);
        admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        const db = new Client({ connectionString: withDatabase(adminUrl as string, dbName) });
        await db.connect();
        try {
            // Same shape as deploy/postgres/init/01-service-schemas.sh (roles are cluster-wide, so they exist).
            await db.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
            await db.query('CREATE SCHEMA extensions');
            await db.query('CREATE EXTENSION vector WITH SCHEMA extensions');
            await db.query('GRANT USAGE ON SCHEMA extensions TO PUBLIC');
            for (const s of SERVICES) {
                await db.query(`GRANT CONNECT ON DATABASE ${dbName} TO ${s}_svc`);
                await db.query(`CREATE SCHEMA ${s} AUTHORIZATION ${s}_svc`);
            }
        } finally {
            await db.end();
        }
    });

    afterAll(async () => {
        await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin?.end();
    });

    it.each(SERVICES)('%s: migrate deploy exits 0, status is up to date, no schema drift', (svc) => {
        const deploy = prisma(svc, ['migrate', 'deploy']);
        expect(deploy.status).toBe(0);
        const status = prisma(svc, ['migrate', 'status']);
        expect(status.status).toBe(0);
        expect(status.stdout).toContain('Database schema is up to date');
        const diff = spawnSync(
            PRISMA,
            ['migrate', 'diff', '--from-url', smokeUrl(svc), '--to-schema-datamodel', schemaPath(svc), '--exit-code'],
            { cwd: ROOT, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: smokeUrl(svc) } }
        );
        expect(diff.status).toBe(0);
    });

    it('seed:dev (auth -> admin -> ai-chat -> vocabulary) exits 0 and the counts match the pre-split seed', async () => {
        for (const svc of SEEDED) {
            const r = seed(svc, '--dev');
            expect([svc, r.status, r.stderr]).toEqual([svc, 0, '']);
        }
        expect(await count('admin', 'PageFeatureFlag')).toBe(9);
        expect(await count('aichat', 'SubjectCategory')).toBe(4);
        expect(await count('aichat', 'Subject')).toBe(15);
        expect(await count('vocabulary', 'WordFamilyCategory')).toBe(10);
        expect(await count('auth', 'User')).toBe(8); // admin + 7 dev accounts
        expect(await count('admin', 'AdminAudit')).toBe(20);
    });

    it('the reference seeds are idempotent (a second run adds no flags, subjects, categories or users)', async () => {
        for (const svc of SEEDED) expect(seed(svc, '--dev').status).toBe(0);
        expect(await count('admin', 'PageFeatureFlag')).toBe(9);
        expect(await count('aichat', 'Subject')).toBe(15);
        expect(await count('vocabulary', 'WordFamilyCategory')).toBe(10);
        expect(await count('auth', 'User')).toBe(8);
    });
});
