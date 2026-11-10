#!/usr/bin/env node
/**
 * Creates a throwaway superuser shadow database for `prisma migrate diff` and
 * prints its connection URL on stdout. `migrate dev` needs a shadow DB; prod
 * `migrate deploy` does not. Requires PRISMA_ADMIN_URL (a superuser URL to any
 * existing database of a LOCAL dev Postgres).
 *
 *   PRISMA_ADMIN_URL=postgresql://examio:examio@127.0.0.1:5432/examio \
 *     node scripts/prisma-shadow-db.cjs <svc>
 */
const { Client } = require('pg');

async function main() {
    const svc = process.argv[2];
    if (!/^[a-z]+$/.test(svc ?? '')) throw new Error('usage: prisma-shadow-db.cjs <svc>');
    const adminUrl = process.env.PRISMA_ADMIN_URL;
    if (!adminUrl) throw new Error('PRISMA_ADMIN_URL (superuser URL of a local dev Postgres) is required');
    const admin = new URL(adminUrl);
    if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(admin.hostname) && process.env.PRISMA_ALLOW_REMOTE_SHADOW !== '1') {
        throw new Error(`refusing to create a shadow database on non-local host ${admin.hostname}`);
    }
    const dbName = `examio_shadow_${svc}`;

    const root = new Client({ connectionString: adminUrl });
    await root.connect();
    try {
        await root.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await root.query(`CREATE DATABASE ${dbName}`);
    } finally {
        await root.end();
    }

    const shadow = new URL(adminUrl);
    shadow.pathname = `/${dbName}`;
    const client = new Client({ connectionString: shadow.toString() });
    await client.connect();
    try {
        await client.query('CREATE SCHEMA IF NOT EXISTS extensions');
        await client.query('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions');
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${svc}`);
    } finally {
        await client.end();
    }
    shadow.searchParams.set('schema', svc);
    process.stdout.write(`${shadow.toString()}\n`);
}

main().catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
});
