# Review: rebrand Examio → KMAEdu (branch `chore/rebrand-kmaedu`, staged diff)

Date: 2026-11-11 · Depth: script + hand edits + cross-service seams (mechanical diff sampled, not read file by file)

## Score: 8/10. No critical findings. Ready to ship after W1–W3.

The script and the seams hold up. The real risks are external resources outside the repo that the generic `examio` → `kmaedu` rule renamed silently: the R2 bucket and its public host, and an unowned domain in the OAuth allowlist. Phase 08 does not cover them.

## Verified (no finding)

- **Script** (`scripts/rebrand.py`): rules go from specific to generic (api-url → api-host → r2-host → site-host → ghcr → repo → case variants), so no generic rule runs before a host rule. Path moves run deepest first, so each `git mv` sees a path that still exists. Only `git ls-files` paths are touched, so no `.env` is read. CRLF survives (`write_text` with newline=None on POSIX). The only `KMAEDU` hits are test hosts (`CDN.KMAEDU.TEST`), so no env-var names were renamed. `test_rebrand.py` passes 4/4 (`python3 -m unittest`). Residue: `git grep -i examio` and `git ls-files | grep -i examio` both return nothing outside the two allowed exclusions. The docx was regenerated, and its `word/document.xml` has no `examio`.
- **Proto**: `libs/contracts/src/index.ts` (`kmaedu/<svc>/v1/*.proto`, pkg `kmaedu.*.v1`) matches the nest-cli asset globs `../../../proto/kmaedu/**`. All 7 Python stubs import under `kmaedu.*` with descriptor package `kmaedu.*.v1`, checked with the ai-service venv. `gen_grpc.sh` points at `proto/kmaedu`. `buf.yaml` finance `ignore_only` entries are removed and the lint ignores are kept.
- **Broker**: the exchange is `kmaedu.events` in all three places that must agree: `libs/messaging/src/topology.ts:1`, `apps/ai-service/src/backend/messaging/topology.py:14`, and the `definitions.template.json` bindings and permission regexes.
- **JWT**: the `kmaedu-auth`/`kmaedu` defaults match across `libs/auth-jwt/src/auth-jwt.module.ts:58-62`, `ai-service service_token.py:90`, every `.env.example`, `deploy/.env.example`, compose and CI.
- **DB**: compose uses `${POSTGRES_DB:?}` everywhere and `deploy/.env.example` sets `POSTGRES_DB=kmaedu`. The CI `kmaedu_ci` value is the same in every job.
- **Images and containers**: `deploy/services.json` keys match compose `image: ghcr.io/tgiap04/kmaedu-<key>`. `deploy-service.sh` matches. nginx upstream `kmaedu-gateway-a/b` matches the compose `container_name`.
- **CI paths**: every `working-directory`, `cache-dependency-path`, `subdir`, `-v $PWD/kmaedu-fe/...` and the `../kmaedu-fe/src/types/permissions.generated.ts` path is updated. The deploy-tooling fixture tests pass (`changed-services.test.sh` exit 0, `lint-migrations.test.sh` exit 0). No migration file had its content changed (all R100), so `lint-migrations --diff-filter=A` sees no "added" old migrations.
- **yarn.lock**: `yarn install --immutable` exits clean in both `kmaedu-fe` (`kmaedu-fe@workspace:.`) and `kmaedu-be`.
- **Docs**: no mobile (`examio-app`/`kmaedu-app`) references remain in CLAUDE.md, AGENTS.md, README, ARCHITECTURE, the roadmap, `docs/system/{overview,business-rules}.md` or `route-list.md`. `POST /auth/exchange` is described as a "native client" flow, which matches `auth.controller.ts:581/698`.
- **Logo.tsx**: only the wordmark text, the alt text and the removal of `lowercase` changed. The `text-coral`/`text-ink` tokens and the Fredoka font already existed. `logo_light.png` is a mark with no text (a book and a robot), so leaving it unchanged is fine. This departs from phase-03 step 2, which planned new PNGs and a `public/brand/kmaedu-logo.svg`. Record the change of plan.

## Critical

None.

## Warning

**W1. R2 bucket name and public host renamed by the generic rule, with no plan step.**
- `kmaedu-be/apps/r2-service/src/config/r2.config.ts:8`: the default bucket changed from `'examio'` to `'kmaedu'`.
- `kmaedu-be/apps/r2-service/src/config/r2.config.ts:16`: the default public host changed from `examio-r2.fayedark.com` to `kmaedu-r2.fayedark.com`. `apps/r2-service/.env.example:15,18` and `kmaedu-be/.env.example:69` changed the same way.
- Both defaults use `||`, so a blank `R2_BUCKET_NAME=` (which is how `deploy/env/r2.env.example` ships) now falls back to a bucket that does not exist. Uploads fail, or public URLs point at an unbound host.
- **Fix:** add to phase-08's manual list: "create or rename the R2 bucket `kmaedu`, or set `R2_BUCKET_NAME` explicitly; bind the custom domain `kmaedu-r2.fayedark.com` on the bucket before deploy". Better still, make `R2_BUCKET_NAME`/`R2_PUBLIC_URL` required when `NODE_ENV=production`, with no default.

**W2. The R2 public-host default does not agree between services.**
- `kmaedu-be/apps/content-service/src/clients/r2.client.ts:133` and `kmaedu-be/apps/document-service/src/clients/r2.client.ts:116` default to `https://r2.kmaedu.fayedark.com`.
- r2-service defaults to `https://kmaedu-r2.fayedark.com` (W1).
- The mismatch existed before (`r2.examio.com` vs `examio-r2.fayedark.com`). The rebrand gave it a dedicated `r2-host` rule but did not align the two.
- With `R2_PUBLIC_URL` unset, key derivation for `r2_delete_tasks` will not match stored URLs, so deletes are skipped and R2 objects are orphaned. CLAUDE.md requires R2 cleanup.
- **Fix:** use one default host in all three files, the one W1 binds.

**W3. Unowned domain in the OAuth app-redirect allowlist example.**
- `kmaedu-be/apps/auth-service/.env.example:52`: `OAUTH_ALLOWED_APP_REDIRECTS=kmaedu://,https://app.kmaedu.com`.
- `kmaedu-be/deploy/env/auth.env.example:22` has the same value, commented.
- `kmaedu.com` is not a domain the project owns. Anyone who copies the example allowlists it, and whoever registers that domain receives the one-time OAuth exchange code (the `?code=` redirect at `auth.controller.ts:581`).
- **Fix:** use `OAUTH_ALLOWED_APP_REDIRECTS=kmaedu://`, or `https://app.kmaedu.fayedark.com` if an https app origin is really needed.

**W4. The locale migration reads a key that never existed, and the changelog describes it wrongly.**
- `kmaedu-fe/src/lib/i18n.ts:7`: `LEGACY_LOCALE_KEY = "kmaedu.locale"`. Nothing has ever written that key, so lines 9-12 are dead code.
- The key that is actually persisted is `LOCALE_KEY = "kmaedu-i18next.locale"` (line 6), formerly `examio-i18next.locale`.
- `docs/project-changelog.md` (the rebrand "Frontend" bullet) says `examio.locale` → `kmaedu.locale`.
- **Fix:** delete lines 7-12 (phase-03 already decided YAGNI on migrating the key). Reword the changelog to "`examio-i18next.locale` → `kmaedu-i18next.locale` (language choice resets once)".

**W5. The new favicon is not what browsers show.**
- `kmaedu-fe/index.html:6` declares `<link rel="icon" type="image/svg+xml" href="/trong_dong.svg" />`. Browsers use the declared SVG, so the new "K" `public/favicon.ico` is only fetched as a fallback.
- Phase-03 acceptance ("favicon K") is therefore not met in practice.
- **Fix:** use `<link rel="icon" href="/favicon.ico" sizes="48x48 32x32" />`, and drop the SVG link or move it after the ico if it is still wanted.

**W6. The `proto:breaking` label only works if it is present when the run fires.**
- `.github/workflows/ci.yml:36` reads the label, but `on: pull_request` uses the default event types, so adding the label later does not trigger a new run.
- Without the label, buf fails twice over: the package rename is a breaking change, and `subdir=kmaedu-be/proto` does not exist at the base commit.
- **Fix:** create the `proto:breaking` label in `tgiap04/kmaedu` first. Open the PR with the label, or re-run the `buf` job after adding it, as the existing `migration:contract` comment already advises. Say so in the PR body.

## Suggestion

**S1. Unrelated empty file staged.** `plans/reports/researcher-261110-ai-exam-proctoring-face-drowsiness.md` (0 bytes, status A) is outside the rebrand scope. Unstage it: `git restore --staged <path>` is the user's call, since the reviewer runs no git restore.

**S2. Broken brand image on the auth header.** `kmaedu-fe/src/components/organisms/auth/auth-layout-shell.tsx:38` points `src="/kmaedu-lightmode.png"` at a file that does not exist. `/examio-lightmode.png` was missing at HEAD too, so this predates the rebrand, but the rebrand touched the line and it is a visible brand spot. **Fix:** `src="/logo_light.png"`, or render `<LogoOnly sizeIcon={32} />`.

**S3. Email addresses now on a real domain.**
- `support@kmaedu.fayedark.com` appears in `kmaedu-be/templates/{change-password,reset-password,verify-account}.template.ejs` (lines 85, 94, 85) and `welcome.template.ejs:314`. Make sure that mailbox exists, or the transactional emails send users to a dead address.
- The dev seed accounts in `kmaedu-be/libs/common/src/seed/dev-seed-users.ts:16-32` (`user1@kmaedu.fayedark.com`…) would be safer on a non-routable domain such as `@kmaedu.test`.

**S4. Japanese copy has foreign-script fragments (pre-existing, user-visible).**
- `kmaedu-fe/public/locales/ja/landing.json:231` contains Korean "서비스를 제공합니다". Replace with "KMAEduはサービスを現状のまま提供します。".
- `:278` contains Chinese "系统的". Replace with "体系的に".

**S5. Leftover old product name.** `kmaedu-be/package.json:2` still reads `"name": "codecraft-be"`. Rename it to `kmaedu-be` if the branding should be complete. The `yarn.lock` workspace entry then needs regenerating.

**S6. Changelog history mentions `kmaedu-app`.** Lines 24, 161, 194, 224, 307, 367 refer to a `kmaedu-app` that never existed. This follows the "rename everything" decision, but it reads oddly. Optional: write "the mobile app (no longer in the repo)".

**S7. GHCR images do not exist yet.** `ghcr.io/tgiap04/kmaedu-*:main` has never been pushed, so `docker compose up` on a fresh host fails at the pull step until CD is rebuilt. Phase 08 acknowledges this. Restate it in the PR body.

## Edge cases scouted

- Equal-length rename (6 characters) keeps hand-edited serialized proto descriptors valid. The stubs import correctly.
- The `\b` after `examio` in the `repo` rule also matches `cychipo/examio-auth`. The `ghcr` rule runs first, so those lines were already rewritten. The only remaining slug is `cutover-runbook.md:209` (`--repo tgiap04/kmaedu`), which is correct.
- The dev seed ID salt changed (`kmaedu-dev-seed:`, `dev-seed-users.ts:27`), so seeded IDs change. This is fine because the plan includes a DB reset.
- The `EVENT_HANDLER_METADATA` key changed (`libs/messaging/src/event-handler.decorator.ts:3`). It only lives in process, so nothing persisted is affected.

## Actions in order

1. W3: drop `https://app.kmaedu.com` from both env examples.
2. W1 + W2: add the R2 bucket and domain steps to phase-08, and align the three R2 public-host defaults.
3. W6: create the `proto:breaking` label and open the PR with it.
4. W5: point `index.html` at `favicon.ico`.
5. W4: delete the dead legacy-locale block and fix the changelog bullet.
6. S1, S2, S4, then the remaining suggestions.

## Numbers

- Type coverage: not measured. The controller reports backend typecheck and the FE build green.
- Test coverage: not measured. This is a rename with no new logic. The script tests pass 4/4 and the deploy-tooling fixture tests pass.
- Lint findings: 0 new. The controller reports FE lint and proto lint green.

## Still unresolved

- Docker boot and e2e are still running with the tester; this review relies on that result for compose rendering and the rabbitmq-defs render.
- I did not check whether `examio.com` / `kmaedu.com` was ever owned. W3 stands either way.
- The `docs/generated/*` drift checks (`gen:permissions-doc`, `gen:fe-permissions`) were not re-run here because they write files. CI will catch any drift.

**Status:** DONE_WITH_CONCERNS
**Summary:** The rename script, its rule order and the cross-service seams (proto paths, `kmaedu.events`, JWT iss/aud, DB, images, CI paths, yarn.lock) are consistent and verified. No critical findings; score 8/10.
**Concerns/Blockers:** The generic rule renamed real external resources with no ops step: the R2 bucket `kmaedu` and the host `kmaedu-r2.fayedark.com` (W1/W2). The OAuth allowlist example names the unowned `app.kmaedu.com` (W3). The favicon is not wired in `index.html` (W5). The `proto:breaking` label must exist and be on the PR before the CI run (W6).
