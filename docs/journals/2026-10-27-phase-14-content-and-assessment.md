# Phase 14: exam-service split into content and assessment, and two failures that were the harness, not the code

**Date**: 2026-10-27
**Severity**: medium
**Component**: examio-be content-service (new), assessment-service (renamed from exam-service), libs/grpc document client, gateway routes.yaml, r2/finance/auth/ai-service allowlists, deploy/compose, RabbitMQ definitions, postgres init, CI, examio-fe exam room detail
**Status**: resolved (signed off 2026-10-27)

## What Happened

Phase 14 is 13 commits, `62339ba..2137847`, on top of `ebae483`, not pushed. exam-service no longer exists:
- **content-service:** owns quiz sets, flashcard sets and the AI generation money flow. It serves gRPC `examio.content.v1.ContentService` and publishes `content.quizset.deleted`.
- **assessment-service:** a git-mv of exam-service, owning rooms, sessions and attempts.

Each exam session now freezes the quiz into `ExamSession.quizSnapshot` + `quizSnapshotHash`:
- Grading, quiz delivery and labels read only the snapshot.
- A teacher can refresh it while the session is UPCOMING with 0 attempts; otherwise the call returns 409 `SNAPSHOT_LOCKED`. Refresh takes the same `FOR UPDATE` row lock as attempt start.
- Deleting a quiz set no longer cascades into rooms. Rooms get `sourceDeleted`, and a new session returns 422 `QUIZSET_DELETED`.

The FE shows an "Đề đã thay đổi" banner with a refresh button.

## The Brutal Truth

The two failures the tester flagged as product bugs were both harness defects. The F3 rerun cost one Vite boot. Evidence:
- **F3, SessionUnavailable on `/exam-session/:id`:**
  - The first probe blocked `**/api/v1/auth/me`, but the FE calls `/auth/me?_t=...`, so nothing was blocked and the page loaded normally.
  - The second probe did block it, but it only looked for the Vietnamese text. Headless Chrome resolved `en`, so the page showed "Cannot reach the server".
  - A rerun in both locales passed.
- **F2, history-stats key names:** a deviation already recorded in the phase file (keep `examsCreated`/`flashcardSets`/`totalPDFs`). The acceptance criterion had not been updated to match it.

The real defect came from review, not from tests (M1). content-service was put on the `internal` network only, while its flashcard routes still verify Cloudflare Turnstile tokens; exam had `egress`. No test could catch it, because the FE sends no token today.

The commit run was messy: 13 commits instead of 10. There are two follow-up commits with duplicate subjects for untracked files, and the gateway commit comes before the service it routes to. Each commit is not independently buildable; only the tip is verified.

## Technical Details

- **Evidence:** 164 green runs in `evidence/phase-14/temper-final.json` (raw 256). Excluded rows are harness-invalid runs, expected cross-schema `SET ROLE` denials, and superseded probes.
- **Tests:** unit 2462; content e2e 193; assessment e2e 139; gateway e2e 62. Compose healthy from an empty volume.
- **Review:** opus, SEALED, 0 Critical / 0 High. Deferred lows:
  - The snapshot LRU is bounded by count, not size (50 × up to 1 MB).
  - Legacy `POST /examattempts` ignores RANDOM question selection.
  - A room created while its quiz set is being deleted can miss `sourceDeleted`.
- **Carried to phase 16:** CI only runs `compose config`. A real `up` also needs `PAYMENT_*`, `GOOGLE_CLIENT_*` and `REFRESH_TOKEN_ENC_KEY`.
- **Not run live:** AI generate-from-file money flow, the ADMIN permission row and the flashcard study UI (covered by e2e only).

## Lessons

- **Playwright route globs:** a glob like `**/path` does not match a URL with a query string. Match on `url.pathname`.
- **UI text assertions:** pin the browser locale, or assert on something locale-independent.
- **Network moves:** when a service is split, diff the compose `networks:` of the old service against each new one. A lost `egress` passes every test.
- **Untracked files:** git-manager must stage untracked files in the same commit as the matching tracked changes. Tell it to list `git status --porcelain --untracked-files=all` per group before committing.
- **Pattern-grep in deploy/:** `deploy/.env` holds real credentials and a plain grep there prints them. Use `git grep` only.
