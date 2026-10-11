# Remove Cloudflare Turnstile

Status: done (uncommitted) · Requested 2026-11-13: remove the Cloudflare bot check from the code and drop its env.

## Scope

| Layer | Change |
|---|---|
| BE libs | Delete `libs/common/src/services/turnstile.service.ts` and its exports in `common.module.ts` and `index.ts` |
| auth | `auth.controller.ts`: drop the production captcha requirement and the verify call. `login.dto.ts`, `register.dto.ts`: drop `turnstileToken`. These schemas are `.strict()`, so an old FE bundle that still sends the field gets a 400; ship FE and BE together |
| content | `flashcardset.controller.ts` (`study/:id`, `study/:id/with-code`), `flashcardset.module.ts`, `dto/sharing.dto.ts` |
| assessment | `examattempt.service.ts`, `examattempt.module.ts`, `dto/create-examattempt.dto.ts` |
| compose | content and assessment leave the `egress` network (Turnstile was their only internet call); `infra.yml` comment; topology spec |
| env | `TURNSTILE_SECRET_KEY` / `TURNSTILE_ENFORCE` / `VITE_TURNSTILE_SITE_KEY` removed from every example, the deploy env templates, the FE Dockerfile and compose, and docker-development (render script, compose, `.env.example`, bats) |
| FE | Delete `TurnstileGuard.tsx` and the unused `FullscreenConfirmDialog.tsx`. Update the sign-in/up forms (buttons no longer wait for a token), `authApi`, `examAttemptApi` + `ExamQuizPage`, `env.ts`, `vite-env.d.ts`, the layout footers, the cookie-policy text; remove `@marsidev/react-turnstile` |
| scripts | `cutover-smoke.ts`: drop `TURNSTILE_TOKEN` |
| docs | CLAUDE.md, AGENTS.md, ARCHITECTURE.md, `docs/**` current-state docs, deploy README and runbook; changelog entry. Historical `plans/**` and journals stay untouched |

## Verification

- BE: typecheck auth/content/assessment, jest for the touched modules, `node --test deploy/compose-topology.spec.cjs`
- FE: `yarn build` (tsc + vite), `yarn lint` on the touched files, `yarn test`
- docker-development: `./test/run-tests.sh`
- `git grep -i turnstile` outside history (plans, journals, review archive) returns nothing
