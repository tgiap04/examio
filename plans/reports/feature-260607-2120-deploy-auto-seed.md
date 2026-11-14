# Feature — Auto-seed on `docker compose up -d`

**Date:** 2026-06-07 21:20
**Scope:** `kmaedu-be/deploy/`

## Goal

`docker compose up -d` should bootstrap a fresh deployment end-to-end:
Postgres healthy → migration runs → seed runs → services start.
No manual `docker compose exec` / `yarn run seed:dev` needed.

## Files

- `kmaedu-be/deploy/Dockerfile.seed` (new) — Node 20 + Prisma image
  mirroring `Dockerfile.migration`, CMD = `entrypoint-seed.sh`.
- `kmaedu-be/deploy/entrypoint-seed.sh` (new) — `cd /app && yarn run
  seed:dev`. Exits 0 on success, non-zero on failure.
- `kmaedu-be/deploy/docker-compose.yml` — new `seed` service, depends_on
  `migration: service_completed_successfully` (runs strictly after
  migration finishes) and `postgres: service_healthy`. Picks up
  `DATABASE_URL`, `ADMIN_EMAILS`, `ADMIN_DEFAULT_PASSWORD` from
  `env_file: .env`.
- `kmaedu-be/deploy/README.md` — replaced the manual seed instruction
  with a note that seed is now automatic + the `docker compose run --rm
  seed` recipe for re-seeding.

## Behavior

| Trigger | What happens |
|---|---|
| `docker compose up -d` (fresh DB) | migration runs → seed runs → services start. Seed exits 0. |
| `docker compose up -d` (existing data) | seed runs again, idempotent upserts, exits 0. |
| `docker compose run --rm seed` | Manual re-seed, container is removed on exit. |
| `docker compose up` failure | seed exit non-zero blocks downstream via `depends_on`. |

## Password Source of Truth

`ADMIN_DEFAULT_PASSWORD` from `deploy/.env` (already populated at
`deploy/.env:121` with `DevT@2811204`) flows through:
- admin-service container (existing `docker-compose.yml:242`)
- seed container (new)

`seed-dev.ts` resolves password as:
```ts
process.env.SEED_PASSWORD ??          // CI override
process.env.ADMIN_DEFAULT_PASSWORD ?? // shared with admin bootstrap
'password123';                        // last-resort
```

## Verified

- `docker compose config` lists `seed` as a service and resolves
  `ADMIN_DEFAULT_PASSWORD: DevT@2811204`, `ADMIN_EMAILS: togiap.admin@kmaedu.fayedark.com`.
- `seed-dev.ts` locally picks up `ADMIN_DEFAULT_PASSWORD=admin04` from
  `kmaedu-be/.env`, login confirms end-to-end works.

## Out of Scope (intentionally)

- No production-data seeding automation. This is the **dev** seed
  (`yarn run seed:dev`). Production DBs should rely on `ADMIN_EMAILS`
  + admin-service bootstrap, not on seeding demo users.
- No healthcheck on seed (exits 0 → done). If you want it to block
  services from starting, the current `depends_on` already does that.
