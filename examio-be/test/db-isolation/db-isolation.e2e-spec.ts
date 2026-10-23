import { Client } from 'pg';
import { SERVICES, assertLocal, describeWhenEnabled, urlOf } from './db-env';

/** A service role sees only its own schema (phase 11). Needs the migrations applied. */
const enabled = SERVICES.every((s) => urlOf(s)) && urlOf('content');
const describeDb = describeWhenEnabled(Boolean(enabled), 'AUTH/FINANCE/ADMIN/EXAM/CONTENT_DATABASE_URL');

/** Plain connection string: node-postgres must not see Prisma's `?schema=`. */
const pgUrl = (svc: string): string => {
    const u = new URL(urlOf(svc) as string);
    u.searchParams.delete('schema');
    return u.toString();
};

async function as<T>(svc: string, fn: (c: Client) => Promise<T>): Promise<T> {
    assertLocal(pgUrl(svc));
    const client = new Client({ connectionString: pgUrl(svc) });
    await client.connect();
    try {
        return await fn(client);
    } finally {
        await client.end();
    }
}

describeDb('database-per-service isolation (e2e)', () => {
    it('content_svc cannot read auth."User": permission denied', async () => {
        await expect(as('content', (c) => c.query('SELECT 1 FROM auth."User"'))).rejects.toMatchObject({
            code: '42501', // insufficient_privilege (no USAGE on schema auth)
            message: expect.stringContaining('permission denied'),
        });
    });

    it('auth_svc raw SQL on outbox_events resolves in schema auth (role search_path)', async () => {
        await as('auth', async (c) => {
            const viaSearchPath = await c.query('SELECT count(*)::int AS n FROM outbox_events');
            const qualified = await c.query('SELECT count(*)::int AS n FROM auth.outbox_events');
            expect(viaSearchPath.rows[0].n).toBe(qualified.rows[0].n);
            expect((await c.query('SHOW search_path')).rows[0].search_path).toBe('auth, extensions');
        });
    });

    const pairs = SERVICES.flatMap((from) => SERVICES.filter((to) => to !== from).map((to) => [from, to] as const));
    it.each(pairs)('%s_svc cannot read the %s schema', async (from, to) => {
        const table = { auth: '"User"', finance: '"Wallet"', admin: '"AdminAudit"', exam: '"QuizSet"' }[to];
        await expect(as(from, (c) => c.query(`SELECT 1 FROM ${to}.${table}`))).rejects.toMatchObject({ code: '42501' });
    });

    it('a service role cannot create objects in public', async () => {
        await expect(as('auth', (c) => c.query('CREATE TABLE public.should_not_exist (id int)'))).rejects.toMatchObject({
            code: '42501',
        });
    });

    it('exam_svc resolves the pgvector type through the shared extensions schema', async () => {
        await as('exam', async (c) => {
            const r = await c.query("SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector AS d");
            expect(Number(r.rows[0].d)).toBeCloseTo(1);
        });
    });
});
