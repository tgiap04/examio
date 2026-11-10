# Phase 11 database per service: one role per schema, and the R2 delete that was never durable

**Date**: 2026-10-23 11:18
**Severity**: high
**Component**: examio-be libs/database (removed), auth, finance, admin, exam, gateway, r2, ai-service; deploy/postgres, deploy/compose; libs/common r2-key-from-url; libs/messaging r2-delete
**Status**: resolved

## What Happened

Phase 11 gave each service its own Postgres role (`<svc>_svc`), its own schema, its own Prisma client and migrations. The shared `libs/database` and its stale `prisma/` tree are gone. Commits `dc7c95b..6a7248e` (8) landed it.

What shipped:
- 11 schemas and roles from `deploy/postgres/init/01-service-schemas.sh`, plus an `extensions` schema for pgvector. `public` is revoked.
- Per-service Prisma: auth, finance and admin each have one `schema.prisma`. Exam is multi-file under `prisma/schema/`. Baseline migrations run through `<svc>-migrate` one-shots.
- No FK to `User` anywhere. `userId` stays with `@@index`.
- Durable R2 deletion: `r2_delete_tasks` is written in the same transaction as the row delete or image replace. A leased worker drains it through r2 `DeleteObjects`.
- Compose split into `deploy/compose/*.yml`. The seed is opt-in behind the `seed` profile.
- ai-service connects as `ai_svc` with `DB_SEARCH_PATH=exam,extensions` and `AI_RUNTIME_DDL=false`.

## The Brutal Truth

The schema split itself was the easy part. The galling part is that the R2 "cleanup" was never a cleanup. Every thumbnail, avatar and AI key was deleted after the row delete with no retry. Worse, the owner check on those URLs could be walked past, so one user could reach another user's object. Those holes predate this phase. We found them because we wrote the durable delete and then tested it against hostile input.

The bring-up also lied to us for three rounds. `up --wait` failed on a fresh stack, and the seed re-ran on every `up`. The static gates were green the whole time.

The tired truth: four temper rounds, and the last one still found a same-host, different-port URL that passed the owner check.

## Technical Details

- F4: `getaddrinfo EAI_AGAIN repo.yarnpkg.com`, seed exit 1. The image's `rm -rf /root/.cache` removed corepack's yarn. Seed runs on `examio-internal` with no egress.
- F1: `command not found: scripts/prisma-generate.sh`, exit 127. The seed image never copied `scripts/`.
- `.dockerignore` did not exclude nested `apps/*/.env`. Real DB credentials would have entered the image. Fixed with `**/.env`.
- F9: `container examio-seed exited (0)` from `up -d --wait`. Exit 1, though every service was healthy.
- F10: `AdminAudit` 20, then 40, then 60 across three plain `up -d` runs.
- Pre-existing R2 holes (inspection verdict): avatar `user-update.writer.ts:63` (High), thumbnail `owned-thumbnail.ts:19` (High), AI `keyR2` `ai.service.ts:1010` (High). `createUserStorage` could also overwrite another user's row; it now returns 409.
- F11: `.../flashcardset-thumbnails/<B>/%2e%2e/<A>/<file>` returned 201. `split('/').includes('..')` saw a literal `%2e%2e`, and the browser normalised it to A's object.
- F12: the same gap on `keyR2`, with a `UserStorage` row created and 1 credit charged.
- F16: `http://examio-p11t2.s3stub:80/...` on the same host as `R2_PUBLIC_URL` returned 201. The origin compare treated a different port as external.
- Round-1 review, worker lease: the lease equalled the R2 call deadline, so a slow call could be re-claimed and sent twice. Now lease 120 s (floor 60 s) against a 10 s deadline, and DONE/FAIL only apply while the lease token still matches.
- Round-1 review, poison key: one bad key failed the whole `DeleteObjects` batch. r2 now returns per-key `failed_keys`; only the bad key backs off.
- Round-1 review, ai-service pools: the five pools summed to max 45 against the `ai_svc` `CONNECTION LIMIT 40`. Default sum is now 28.
- Final static: `TZ=UTC yarn test` 1964 passed, 5 skipped. `check:ownership` 0. `check:deps` 0. Live `up -d --wait` from an empty volume exit 0. Smoke 18/18.

## What We Tried

- Round 1: found F1, F4, F5 (e2e specs outside the jest regex), F6 (Turnstile in production), F7, F8. Fixed F1 and F8. F4 open.
- Round 2: F4 fixed by `COREPACK_HOME=/opt/corepack`. F9 and F10 found. F11 and F12 found by the cross-user probe.
- Round 3: F11 and F12 fixed in the key parser: owner prefix, `href === url`, canonical-segment allowlist. Ten of 15 new cases failed against a scratch reconstruction of the old logic. F9 checked at config level only.
- Round 4: live `up --wait` exit 0. F16 found by probe (c). Fixed with `isR2Host` (same hostname, any port is foreign). Proven by the unit spec only, because the live re-probe was not re-run.

## Root Cause Analysis

The R2 keys were not owner-scoped and the URL check compared strings, not parsed URLs. We validated the shape of a URL and trusted what the browser would later resolve. Encoded dots, tabs and upper-case hosts all slipped through a check written for the happy path.

The bring-up problems came from treating the seed as part of `up`. A one-shot that nothing depends on exits 0, and Compose reports that as a failure under `--wait`. An idempotent-looking seed with random ids is not idempotent.

## Decisions

- Fix the pre-existing cross-user R2 bugs inside Phase 11, not in a follow-up. The user chose that.
- Only exact, canonical, server-issued URLs are deletable. Legacy owner-less keys are never deleted and stay as accepted orphans.
- `R2_PUBLIC_URL` must be a hostname dedicated to the bucket. A shared hostname would reject unrelated images. Fails closed; `deploy/README.md` now says so.
- Seed is opt-in (`--profile seed`), so `up` no longer seeds dev data. Cost: devs run one extra command.

## Lessons Learned

- Validate the resolved identity, not the string shape. Parse the URL, rebuild its canonical form, and require `href === url` before trusting a key.
- Test the security boundary with hostile input in the same round as the feature. The owner check only failed once we sent `%2e%2e` at it.
- A one-shot seed does not belong in the default `up` path. Keep it behind a profile and make inserts upserts.
- Run every compose or image build in a scratch copy with a dummy `.env`, sequentially. Parallel builds OOM the 8 GB Docker VM.

## Next Steps

- F13 (AI credit charged at upload, no refund on OCR failure) and the `ai.service` retry double-charge. Owner: phase 15, charge-first job flow.
- F15 (`AI_DB_POOL_MAX_*` has no upper bound and can exceed the `ai_svc` limit of 40). Owner: phase 16.
- Second public hostname alias for the same bucket. Deferred.
- Re-run the F16 probe (c) live against the fixed stack. Owner: not named in the sources; assign it.
- Explain the one unexplained `user-enrichment.ownership.e2e-spec.ts` failure in run 1 of re-temper 3. Not reproduced in four later runs. Treat as a flake until a full log shows it.
