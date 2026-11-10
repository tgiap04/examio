# Spike — Prisma / bundling go/no-go (Phase 01 step 3) — 2026-10-18

**Verdict: GO.** Phase 11 uses `prisma-client` + `engineType = "client"` + `@prisma/adapter-pg`. The fallback (`prisma-client-js`) was not needed.
Scope: finance-service (Payment, Wallet, WalletTransaction, UserSubscription). Tested on arm64 (Apple-silicon Docker) only. **amd64 is unverified: confirm in CI (phase 11/16).**

## Versions
prisma / @prisma/client / @prisma/adapter-pg 6.19.3 · pg 8.23.1 · @nestjs/cli 11.0.21 · webpack 5.106.0 · node:22-alpine · pgvector/pgvector:pg16.

## Working config
```prisma
generator client {
    provider     = "prisma-client"
    output       = "../src/generated/prisma"
    engineType   = "client"
    moduleFormat = "cjs"
}
```
```ts
const u = new URL(process.env.DATABASE_URL!);
const schema = u.searchParams.get('schema') ?? 'public';
u.searchParams.delete('schema');
super({ adapter: new PrismaPg({ connectionString: u.toString(), max: 5 }, { schema }) });
```
```js
// deploy/webpack.service.js (nest-cli.json compilerOptions.webpackConfigPath per project)
module.exports = (options, webpack) => ({
  ...options,
  externals: [],
  plugins: [...options.plugins,
    new webpack.IgnorePlugin({ resourceRegExp: /^(kafkajs|mqtt|nats)$/ }),
    new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 })],
});
```

## Evidence
| Command | Exit |
|---|---|
| `prisma generate --schema apps/finance-service/prisma/schema.prisma` | 0 |
| `nest build finance-service --webpack` (default externals) | 0 |
| same, `externals: []` without IgnorePlugin | 1 (`main.js` still emitted, so CI must check the exit code) |
| same, `externals: []` + IgnorePlugin | 0 |
| `prisma migrate dev --create-only --name init` (superuser, needs a shadow DB) | 0 |
| `prisma migrate deploy` as `finance_svc` after a superuser `migrate dev` | failed: permission denied on `_prisma_migrations` (exit code not captured) |
| `prisma migrate deploy` re-run ("No pending migrations") | 0 |
| `docker build --target runtime` | 0 |
| `docker run … prisma migrate deploy` (alpine, fresh schema) | 0 |
| `jest …/spike/prisma.service.spec.ts` (2 tests) | 0 |

- Bundle: 8.1 MB `main.js`, no native engine, runs with no `node_modules`. The full real finance-service bundles to 21 MB (not run).
- Image: 63.3 MB of content (245 MB uncompressed on Docker Desktop). The build stage is 1.91 GB.
- Schema: `_prisma_migrations` and all tables land in `finance`, none in `public`. Model queries are schema-qualified by the adapter. `$queryRaw` with unqualified tables depends on the role's `search_path` (negative control returned 500 after `RESET search_path`).

## Gotchas for phase 11
1. Never `migrate dev` as superuser against a schema the service role later deploys to (ownership of `_prisma_migrations`). Use the service role, or a throwaway DB / `shadowDatabaseUrl`.
2. With adapter-pg, `$queryRaw` on Postgres `name` columns throws `UnsupportedNativeDataType` → cast `::text`. Cast `count(*)::int` to avoid BigInt.
3. Remove the root `tsconfig.json` `.prisma/client` path mappings when moving a service. ForkTsChecker type-checks the whole `include`.
4. The custom webpack needs `externals: []`, IgnorePlugin for optional peers (`kafkajs|mqtt|nats`, extend as needed) and `LimitChunkCountPlugin`.
5. `.env` is not auto-loaded. Pass `DATABASE_URL` explicitly in Docker/CI.
6. `.dockerignore` only excludes root `prisma/migrations`. Nested `apps/<svc>/prisma/migrations` survive (keep it that way).
7. Proto files need webpack `assets` copying in bundled builds (untested).
8. `moduleFormat = "cjs"` is required for Nest.
9. Confirm the `linux-musl-openssl-3.0.x` schema engine on amd64 in CI.

Throwaway files live only in worktree `.claude/worktrees/agent-aa9041d9f043a8b35` (branch `worktree-agent-aa9041d9f043a8b35`). Nothing was merged.
