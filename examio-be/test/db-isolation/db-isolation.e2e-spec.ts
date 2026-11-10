import { Client } from 'pg';
import { SERVICES, assertLocal, describeWhenEnabled, urlOf } from './db-env';

/** A service role sees only its own schema (phase 11). Needs the migrations applied. */
const enabled = SERVICES.every((s) => urlOf(s));
const describeDb = describeWhenEnabled(Boolean(enabled), 'AUTH/FINANCE/ADMIN/CONTENT/ASSESSMENT/VOCABULARY/AICHAT_DATABASE_URL');

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
        const table = {
            auth: '"User"',
            finance: '"Wallet"',
            admin: '"AdminAudit"',
            content: '"QuizSet"',
            assessment: '"ExamRoom"',
            vocabulary: '"WordFamily"',
            aichat: '"AIChat"',
        }[to];
        await expect(as(from, (c) => c.query(`SELECT 1 FROM ${to}.${table}`))).rejects.toMatchObject({ code: '42501' });
    });

    // document-service (phase 15) is not in SERVICES (it has no seed), so its isolation is checked here.
    const documentIt = urlOf('document') ? it : it.skip;
    documentIt.each([['document', 'content', '"QuizSet"'], ['assessment', 'document', '"UserStorage"'], ['auth', 'document', '"UserStorage"']])(
        '%s_svc cannot read the %s schema (%s)',
        async (from, to, table) => {
            await expect(as(from, (c) => c.query(`SELECT 1 FROM ${to}.${table}`))).rejects.toMatchObject({ code: '42501' });
        }
    );

    // ai-service (phase 15) owns schema `ai`; it has no grant on the content or assessment schema.
    const aiIt = urlOf('ai') ? it : it.skip;
    aiIt.each([
        ['content', '"QuizSet"'],
        ['content', '"GenerationJob"'],
        ['content', 'outbox_events'],
        ['assessment', '"ExamSession"'],
    ])('ai_svc cannot read %s.%s: permission denied', async (schema, table) => {
        await expect(as('ai', (c) => c.query(`SELECT 1 FROM ${schema}.${table}`))).rejects.toMatchObject({
            code: '42501',
            message: expect.stringContaining('permission denied'),
        });
    });

    it('the exam domain is split: assessment holds no content tables, content holds no assessment tables', async () => {
        await as('assessment', async (c) => {
            const { rows } = await c.query(
                `SELECT table_name FROM information_schema.tables WHERE table_schema = 'assessment'
                 AND table_name IN ('QuizSet','QuizQuestion','DetailsQuizQuestion','FlashCardSet','GenerationJob','r2_delete_tasks')`
            );
            expect(rows).toEqual([]);
        });
        await as('content', async (c) => {
            const { rows } = await c.query(
                `SELECT table_name FROM information_schema.tables WHERE table_schema = 'content'
                 AND table_name IN ('ExamRoom','ExamSession','ExamAttempt','CheatingLog','UserPinnedExamRoom')`
            );
            expect(rows).toEqual([]);
        });
    });

    it('the ai-chat tables live in aichat, not in the assessment or content schemas', async () => {
        for (const schema of ['assessment', 'content']) {
            await as(schema, async (c) => {
                const { rows } = await c.query(
                    `SELECT table_name FROM information_schema.tables WHERE table_schema = '${schema}'
                     AND table_name IN ('AIChat','AIChatMessage','AIChatDocument','Subject','SubjectCategory')`
                );
                expect(rows).toEqual([]);
            });
        }
        await as('aichat', async (c) => {
            expect((await c.query('SHOW search_path')).rows[0].search_path).toBe('aichat, extensions');
            for (const table of ['"AIChat"', '"AIChatMessage"', '"AIChatDocument"', '"Subject"', '"SubjectCategory"', 'r2_delete_tasks', 'processed_events']) {
                const viaSearchPath = await c.query(`SELECT count(*)::int AS n FROM ${table}`);
                const qualified = await c.query(`SELECT count(*)::int AS n FROM aichat.${table}`);
                expect(viaSearchPath.rows[0].n).toBe(qualified.rows[0].n);
            }
        });
    });

    documentIt('document_svc raw SQL on r2_delete_tasks and outbox_events resolves in schema document (role search_path)', async () => {
        await as('document', async (c) => {
            expect((await c.query('SHOW search_path')).rows[0].search_path).toBe('document, extensions');
            for (const table of ['r2_delete_tasks', 'outbox_events', '"UserStorage"']) {
                const viaSearchPath = await c.query(`SELECT count(*)::int AS n FROM ${table}`);
                const qualified = await c.query(`SELECT count(*)::int AS n FROM document.${table}`);
                expect(viaSearchPath.rows[0].n).toBe(qualified.rows[0].n);
            }
        });
    });

    it('a service role cannot create objects in public', async () => {
        await expect(as('auth', (c) => c.query('CREATE TABLE public.should_not_exist (id int)'))).rejects.toMatchObject({
            code: '42501',
        });
    });

    it('assessment_svc resolves the pgvector type through the shared extensions schema', async () => {
        await as('assessment', async (c) => {
            const r = await c.query("SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector AS d");
            expect(Number(r.rows[0].d)).toBeCloseTo(1);
        });
    });
});
