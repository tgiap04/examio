/**
 * Env contract of the database e2e specs (all point at a LOCAL throwaway Postgres
 * initialised like deploy/postgres/init/01-service-schemas.sh):
 *   <SVC>_DATABASE_URL   service-role URL of auth|finance|admin|exam|vocabulary|aichat (+ CONTENT and DOCUMENT for the isolation probes)
 *   PRISMA_ADMIN_URL     superuser URL (only the migration/seed spec: it creates a throwaway database)
 * A spec skips itself when its env is missing, so the plain unit run never needs a database,
 * but under `CI=true` a missing env FAILS it (see `describeWhenEnabled`), so a CI wiring slip cannot go green.
 */
export const SERVICES = ['auth', 'finance', 'admin', 'exam', 'vocabulary', 'aichat'] as const;
export type Service = (typeof SERVICES)[number];

/** Services whose `apps/<dir>-service/prisma/seed.ts` exists (exam has no reference data left) and their app directory. */
export const SEEDED = ['auth', 'finance', 'admin', 'vocabulary', 'aichat'] as const satisfies readonly Service[];
export const APP_DIR: Readonly<Record<Service, string>> = {
    auth: 'auth',
    finance: 'finance',
    admin: 'admin',
    exam: 'exam',
    vocabulary: 'vocabulary',
    aichat: 'ai-chat',
};

export const urlOf = (svc: string): string | undefined => process.env[`${svc.toUpperCase()}_DATABASE_URL`];

export function assertLocal(url: string): void {
    const host = new URL(url).hostname;
    if (!['127.0.0.1', 'localhost', '::1', '[::1]', 'postgres'].includes(host)) {
        throw new Error(`refusing to run database e2e against non-local host ${host}`);
    }
}

/** The same URL pointed at another database (same role, host and `?schema=`). */
export function withDatabase(url: string, database: string): string {
    const u = new URL(url);
    u.pathname = `/${database}`;
    return u.toString();
}

type DescribeFn = (name: string, fn: () => void) => void;

/**
 * `describe` when `enabled`; otherwise `describe.skip` locally and a failing suite when `CI=true`
 * (a database spec that silently skips in CI would hide exactly the regressions it exists for).
 */
export function describeWhenEnabled(enabled: boolean, requiredEnv: string): DescribeFn {
    if (enabled) return describe;
    if (process.env.CI !== 'true') return describe.skip;
    return (name) =>
        describe(name, () => {
            it(`requires ${requiredEnv} in CI (refusing to skip)`, () => {
                throw new Error(`${requiredEnv} must be set when CI=true; this spec must not skip silently`);
            });
        });
}
