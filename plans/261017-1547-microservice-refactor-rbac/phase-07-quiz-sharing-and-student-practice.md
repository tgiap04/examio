# Phase 07 — Quiz Sharing & Student Practice

## Context Links
- Brief: [reports/planner-brief.md](./reports/planner-brief.md) (§07, decision 8)
- Red team (authoritative where it conflicts): [reports/red-team-changes.md](./reports/red-team-changes.md) RT-4, RT-6, RT-7, RT-15 (sharing) <!-- Red Team: RT-4, RT-6, RT-7, RT-15 -->
- Scout: [RBAC surface](./reports/scout-rbac-surface-report.md) §2 (sharing fields; "Quiz: no direct student path"), §1 flashcardset/examsession rows
- Decisions: [reports/decisions.md](./reports/decisions.md) (grant = whitelist / code / public; no Class)
- Phase 06 patterns: `flashcardset-access.ts`, `@RequireOwnerOrPermission`, `access-code-guard.ts`, `user-search.service.ts`, `test/authz/authenticated-allowlist.ts` <!-- Red Team: RT-4, RT-6, RT-7 -->

## Overview
- Priority: P1 · Status: Completed (2026-10-20) · Effort: 2.75d <!-- Red Team: RT-4, RT-7, RT-15 (was 2d: +delta sharing API on quiz + flashcard sets, +separate code-granted list on 3 resources with eviction, +cross-user specs; −FE vitest test, moved to 09) --> · Depends on: 06
- Give teachers QuizSet sharing (public / whitelist / invite code). Give students a real practice flow (granted list, start/resume, autosave, server-scored submit, history). Valid codes are remembered in a separate code-granted list (evicted when the code rotates or is disabled) for flashcard, quiz, and exam session. FE: student practice page + teacher share dialog. <!-- Red Team: RT-15 -->

## Key Insights
- `QuizSet` has only `isPublic` (`exam.prisma:1-21`). `QuizPracticeAttempt` exists but is unused (`exam.prisma:269-304`). It has `@@unique([quizSetId, userId, type])` (`:300`), so only one row per set exists and history is impossible. DB reset → drop the unique.
- The old gateway `quiz-practice-attempts` proxy was deleted in 01. The new prefix is `/api/v1/quiz-practice` (no collision with `GET /quizsets/:id`).
- Code entry is not remembered today: flashcard `with-code` (`flashcardset.service.ts:1211`) and exam `with-code` (`examsession.service.ts:581`) re-require the code every visit. Exam attempt `start` also re-checks the code (`examattempt.service.ts:52-92`).
- <!-- Red Team: RT-15 --> Sharing writes today are full-replace read-modify-write: flashcard `updateSharingSettings` (`flashcardset.service.ts:1322-1363`) and exam session (`examsession.service.ts:692-737`) overwrite `whitelist` (and wipe it plus the code when `isPublic`). `generate-code` controllers call `updateSharingSettings(…, { whitelist: [] })` (`flashcardset.controller.ts:676-695`, `examsession.controller.ts:264-282`; 06 fixes the wipe, gap 6). Codes come from `Math.random()` (`flashcardset.service.ts:1367`, `examsession.service.ts:742`).
- <!-- Red Team: RT-15 --> Fix: deltas applied in ONE SQL statement (no read-modify-write), and code-granted users live in their own column `codeGrantedIds String[]`. Rotating or disabling the code clears that column only, so whitelisted users keep access and code users lose it. Because code unlocks never touch `whitelist`, the remaining full-replace path (exam session host form) has no concurrent writer.
- <!-- Red Team: RT-4 --> exam-service has no `ThrottlerModule`, so `@Throttle` is a no-op there. `unlock` uses 06's `access-code-guard.ts` (Redis lockout, `timingSafeEqual`).
- FE `/k/*` pages hardcode Vietnamese (no `useTranslation`; only landing/auth/admin use i18n). New pages follow the file style (vi literals).
- `ShareFlashcardModal.tsx` is 465 lines. Extract its whitelist picker + code block into small shared components instead of copying (DRY, <200 lines). The extracted picker emits deltas, so the flashcard modal moves to the delta API too. <!-- Red Team: RT-15 -->
- `MyMaterialsPage.tsx:433` calls `POST /flashcardsets/:id/share` as a student. That is owner-only since 06, so build the link client-side.
- <!-- Red Team: RT-11 --> FE vitest does not exist until phase 09. This phase keeps FE logic in pure modules (`lib/quiz-practice/progress.ts`); 09 adds their tests.

## Requirements
- Functional BE:
  - Prisma <!-- Red Team: RT-15 -->:
    - `QuizSet`: `accessCode String?`, `whitelist String[] @default([])`, `codeGrantedIds String[] @default([])`, `@@index([whitelist], type: Gin)`, `@@index([codeGrantedIds], type: Gin)` (granted-list query).
    - `FlashCardSet`, `ExamSession`: add `codeGrantedIds String[] @default([])`.
    - `QuizPracticeAttempt`: drop the unique, add `@@index([quizSetId, userId, isSubmitted])`.
  - One cap `SHARE_LIST_CAP = 2000`, applied to each list (`whitelist`, `codeGrantedIds`) on all three resources. Over the cap → 409 `SHARE_LIST_FULL`. <!-- Red Team: RT-15 -->
  - Teacher (`content:share` + owner → 404; `users/search` uses `user:search`):
    - `GET /quizsets/:id/sharing` → `{ isPublic, accessCode, whitelist: [{id,username,name,avatar}], codeGranted: [{id,username,name,avatar}] }` (one batch `findMany id in` over both lists). <!-- Red Team: RT-15 -->
    - `PUT /quizsets/:id/sharing` `{ addUserIds?: string[], removeUserIds?: string[], isPublic?: boolean, codeEnabled?: boolean }` (each array ≤ 2000, at least one field) <!-- Red Team: RT-15 -->:
      - one atomic `UPDATE` (see Architecture); `removeUserIds` removes from `whitelist` **and** `codeGrantedIds`;
      - `codeEnabled: true` with no code → generate one; `false` → `accessCode = null`, `codeGrantedIds = []`;
      - `isPublic` flips visibility only (lists and code are kept; the access predicate short-circuits on public);
      - response = the GET shape.
    - `POST /quizsets/:id/generate-code` → `{ accessCode }` (6 digits, `crypto.randomInt`). Rotation clears `codeGrantedIds`; `whitelist` untouched. <!-- Red Team: RT-15 -->
    - `GET /quizsets/users/search` (`user:search`, shared `user-search.service.ts`).
  - Flashcard sets (same contract) <!-- Red Team: RT-15 -->: `PUT /flashcardsets/:id/sharing` switches to the delta body; `GET` adds `codeGranted`; `generate-code` rotates with `crypto.randomInt` and clears `codeGrantedIds`.
  - Exam sessions (only where this phase touches them) <!-- Red Team: RT-15 -->: `PUT :id/sharing` stays full-replace for `whitelist` (host-only writer, FE `ExamSessionFormModal` unchanged) but enforces the 2000 cap; any code change (`generate-code`, `PUT :id/sharing` / `PUT /examsessions/:id` (`examsession.service.ts:330`) with a new or null `accessCode`) clears `codeGrantedIds`; codes from `crypto.randomInt`.
  - Student practice (`/api/v1/quiz-practice`):
    - `GET /sets?page&limit` (`quiz:practice`) → sets where `whitelist has me` OR `codeGrantedIds has me` OR (`isPublic` AND I have an attempt), `{ id, title, description, thumbnail, questionCount, owner:{name}, lastAttempt? }`. One query with `_count` + `practiceAttempts: { where: {userId}, take: 1, orderBy: updatedAt desc }`. <!-- Red Team: RT-15 -->
    - `GET /sets/:id/access` (`@Public`; a valid token is used, an invalid one is ignored) → `{ title, questionCount, canAccess, requiresCode, reason: 'owner'|'public'|'whitelist'|'code'|null }`. Never returns code or lists. <!-- Red Team: RT-6, RT-15 -->
    - `POST /sets/:id/unlock` `{ code }` (`quiz:practice`) <!-- Red Team: RT-4 -->: `verifyAccessCodeOrThrow` (06: lockout `exam:codefail:<quizSetId>:<userId>` 5 / 15 min → 429 `CODE_LOCKED`, constant-time compare, Redis error → 503). Valid → append me to `codeGrantedIds`, 200 `{ canAccess: true }`. Invalid → 400 `INVALID_CODE`. No `@Throttle`; the gateway `*/unlock` rate limit is P05.
    - `POST /attempts` `{ quizSetId }` (`@RequireOwnerOrPermission('quiz:practice', QuizSetOwnerResolver(body.quizSetId))`) → resume the latest unsubmitted attempt, else create one. Returns `{ attempt, questions }`, **no correct answers**. <!-- Red Team: RT-7 -->
    - `GET /attempts/:id` (`@Authenticated`, attempt owner `where {id, userId}` → 404) → after submit includes `correctAnswers` + per-question result.
    - `PUT /attempts/:id` `{ answers, currentIndex, markedQuestions, timeSpentSeconds }` (`@Authenticated`, owner, not submitted) → 200.
    - `POST /attempts/:id/submit` (`@Authenticated`, owner) → server scores from DB answers (ignores client score), sets `isSubmitted, score (0–10, 2 decimals), correctAnswers, submittedAt`. A second submit → 409 `ALREADY_SUBMITTED`.
    - `GET /attempts?quizSetId&page&limit` (`@Authenticated`, `where userId = me`) → submitted history, newest first.
    - Attempt endpoints use `@Authenticated` + owner (not `quiz:practice`) so a TEACHER can continue an own-set preview. <!-- Red Team: RT-6, RT-7 -->
  - <!-- Red Team: RT-6 --> Append to `test/authz/authenticated-allowlist.ts` (06): `QuizPracticeController.{startAttempt,getAttempt,saveAttempt,submitAttempt,listAttempts}`, each with `spec: 'apps/exam-service/test/ownership/quiz-practice.ownership.e2e-spec.ts'`.
  - Code remembering <!-- Red Team: RT-4, RT-15 -->: flashcard `POST study/:id/with-code` (`flashcard:study`), exam `POST study/:id/with-code` (`exam:take`), and exam attempt `start` with `accessCode` go through `verifyAccessCodeOrThrow`, then append the user to `codeGrantedIds`, so the next visit skips the code until the code changes. Access predicates (`flashcardset-access.ts`, exam session access `examsession.service.ts:458`, `assertSessionAccess`) also accept `codeGrantedIds has me`.
- Functional FE:
  - Route `/k/practice-quiz/:id` → `QuizPracticePage`:
    - access check → code form if needed (shows "Nhập sai quá nhiều lần, thử lại sau {n} phút" on 429 `CODE_LOCKED`) → start/resume; <!-- Red Team: RT-4 -->
    - question navigator with marked flags;
    - autosave (debounce 2s + on page hide);
    - submit confirm;
    - result view with answers;
    - history tab.
  - `MyMaterialsPage`: new section "Bộ câu hỏi được chia sẻ" (granted sets, "Luyện tập" button), plus empty/loading/error states. The share button for non-owned sets copies `${origin}/study-flashcard/:id` (no API call).
  - Teacher: `ShareQuizSetModal` opened from `ManageQuizSetDetailPage` ("Chia sẻ"):
    - public toggle;
    - whitelist picker (search, add, remove) that sends `{ addUserIds, removeUserIds }` deltas; <!-- Red Team: RT-15 -->
    - "Đã mở bằng mã" list (code-granted users, removable);
    - code on/off, regenerate (confirm: "Người đã mở bằng mã cũ sẽ mất quyền truy cập"), copy; <!-- Red Team: RT-15 -->
    - copy link `${origin}/k/practice-quiz/:id`;
    - 409 `SHARE_LIST_FULL` → "Danh sách chia sẻ đã đạt tối đa 2000 người".
  - `ShareFlashcardModal` uses the same extracted parts and the flashcard delta API. <!-- Red Team: RT-15 -->
- Non-functional: no N+1 (granted list = 1 query, sharing lists = 1 batch). Answers never sent before submit. Files <200 lines.

## Architecture
```
Teacher ─PUT /quizsets/:id/sharing {add,remove,isPublic?,codeEnabled?}─► QuizSetSharingService ─► sharing-list.util (1 UPDATE)
Student ─GET /quiz-practice/sets/:id/access─► canAccessQuizSet(owner|public|whitelist|codeGranted)
        ─POST …/unlock {code}─► verifyAccessCodeOrThrow (06) ─► appendCodeGranted (atomic SQL, cap)
        ─POST /quiz-practice/attempts─► resume|create ─► questions (answers stripped by mapper)
        ─PUT …/:id (autosave) ─► POST …/:id/submit ─► scoreAttempt(DB answers) ─► result
```
<!-- Red Team: RT-15 -->
```sql
-- modules/common/sharing-list.util.ts (parameterised; table + owner column from a fixed enum:
-- QuizSet/"userId", FlashCardSet/"userId"; ExamSession uses appendCodeGranted + clearCodeGranted only)
-- applyDelta:
UPDATE "QuizSet" SET
  whitelist        = ARRAY(SELECT DISTINCT u FROM unnest(array_cat(whitelist, $add::text[])) u WHERE u <> ALL($remove::text[])),
  "codeGrantedIds" = ARRAY(SELECT u FROM unnest("codeGrantedIds") u WHERE u <> ALL($remove::text[]))
WHERE id = $id AND "userId" = $owner
RETURNING cardinality(whitelist) AS n;      -- 0 rows → 404; n > 2000 → throw inside the tx → rollback → 409 SHARE_LIST_FULL
-- appendCodeGranted (unlock / with-code / attempt start):
UPDATE "QuizSet" SET "codeGrantedIds" = array_append("codeGrantedIds", $user)
WHERE id = $id AND NOT ($user = ANY("codeGrantedIds")) AND cardinality("codeGrantedIds") < 2000;
-- 0 rows → already present (ok) or full (409 SHARE_LIST_FULL), decided by one re-read
-- clearCodeGranted (rotate / disable): SET "accessCode" = $code, "codeGrantedIds" = '{}' in the same UPDATE
```

## Related Code Files
File ownership (globs): `examio-be/libs/database/src/models/exam.prisma` (QuizSet, FlashCardSet, ExamSession sharing columns, QuizPracticeAttempt), `examio-be/libs/database/src/migrations/*_quiz_sharing/**`, `examio-be/apps/exam-service/src/modules/quizset/**`, `examio-be/apps/exam-service/src/modules/quiz-practice/**`, `examio-be/apps/exam-service/src/modules/common/sharing-list.util.ts`, `examio-be/apps/exam-service/src/modules/flashcardset/{flashcardset.service.ts,flashcardset.controller.ts,flashcardset-access.ts,dto/*sharing*.ts}` (sharing, generate-code, with-code only), `examio-be/apps/exam-service/src/modules/examsession/{examsession.service.ts,examsession.controller.ts}` (sharing cap, code change eviction, generate-code, with-code, access predicate only), `examio-be/apps/exam-service/src/modules/examattempt/examattempt.service.ts` (`assertSessionAccess` only), `examio-be/apps/exam-service/src/exam-service.module.ts`, `examio-be/apps/exam-service/test/{quiz-practice.e2e-spec.ts,ownership/quiz-practice.ownership.e2e-spec.ts,ownership/sharing.ownership.e2e-spec.ts}`, `examio-be/test/authz/authenticated-allowlist.ts` (append only), `examio-fe/src/apis/{quizPracticeApi,quizsetApi,studentMaterialsApi,flashcardSetApi}.ts` (`flashcardSetApi`: sharing functions only), `examio-fe/src/stores/useQuizPracticeStore.ts`, `examio-fe/src/pages/k/{QuizPracticePage,MyMaterialsPage,ManageQuizSetDetailPage}.tsx`, `examio-fe/src/pages/k/components/quiz-practice/**`, `examio-fe/src/components/organisms/{ShareQuizSetModal,ShareFlashcardModal}.tsx`, `examio-fe/src/components/organisms/share/**`, `examio-fe/src/lib/quiz-practice/**` (no `*.test.ts`; 09 adds them), `examio-fe/src/routes/index.tsx` (one route). <!-- Red Team: RT-6, RT-7, RT-11, RT-15 -->

- Create:
  - `/Users/tgiap.dev/devs/examio/examio-be/libs/database/src/migrations/<ts>_quiz_sharing/migration.sql`
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/modules/quizset/{quizset-sharing.controller.ts,quizset-sharing.service.ts,quizset-access.ts,quizset-owner.resolver.ts,dto/quizset-sharing.dto.ts}` <!-- Red Team: RT-7 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/modules/quiz-practice/{quiz-practice.module.ts,quiz-practice.controller.ts,quiz-practice.service.ts,quiz-practice.repository.ts,quiz-practice-scoring.ts,quiz-practice.mapper.ts,dto/*.ts}`
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/modules/common/sharing-list.util.ts` (+ `.spec.ts`) <!-- Red Team: RT-15 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/test/ownership/{quiz-practice,sharing}.ownership.e2e-spec.ts` <!-- Red Team: RT-7 -->; append-only: `demoted-owner.ownership.e2e-spec.ts` (created in 06) <!-- Updated: Validation Session 1 - demotion keeps content -->
  - `/Users/tgiap.dev/devs/examio/examio-fe/src/apis/quizPracticeApi.ts`, `/Users/tgiap.dev/devs/examio/examio-fe/src/stores/useQuizPracticeStore.ts`
  - `/Users/tgiap.dev/devs/examio/examio-fe/src/pages/k/QuizPracticePage.tsx`, `/Users/tgiap.dev/devs/examio/examio-fe/src/pages/k/components/quiz-practice/{QuestionPanel,QuestionNavigator,PracticeResult,PracticeHistory,AccessCodeForm}.tsx`
  - `/Users/tgiap.dev/devs/examio/examio-fe/src/lib/quiz-practice/progress.ts` (pure; test file in 09) <!-- Red Team: RT-11 -->
  - `/Users/tgiap.dev/devs/examio/examio-fe/src/components/organisms/ShareQuizSetModal.tsx`, `/Users/tgiap.dev/devs/examio/examio-fe/src/components/organisms/share/{WhitelistUserPicker,CodeGrantedList,AccessCodeSection}.tsx` <!-- Red Team: RT-15 -->
- Modify:
  - `/Users/tgiap.dev/devs/examio/examio-be/libs/database/src/models/exam.prisma`, `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/modules/quizset/quizset.module.ts`, `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/exam-service.module.ts`
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/modules/flashcardset/flashcardset.service.ts` (`:1211` with-code, `:1322-1363` delta sharing, `:1367` crypto code, `:1374` GET sharing), `flashcardset.controller.ts` (`:676` generate-code), `flashcardset-access.ts` (codeGranted) <!-- Red Team: RT-15 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/modules/examsession/examsession.service.ts` (`:330` code change eviction, `:458` access, `:581` with-code, `:692-737` cap + eviction, `:742` crypto code), `examsession.controller.ts` (`:264` generate-code) <!-- Red Team: RT-15 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/apps/exam-service/src/modules/examattempt/examattempt.service.ts` (`assertSessionAccess`: codeGranted + append on a valid code) <!-- Red Team: RT-15 -->
  - `/Users/tgiap.dev/devs/examio/examio-be/test/authz/authenticated-allowlist.ts` (append quiz-practice entries) <!-- Red Team: RT-6 -->
  - `/Users/tgiap.dev/devs/examio/examio-fe/src/apis/{quizsetApi,studentMaterialsApi,flashcardSetApi}.ts`, `/Users/tgiap.dev/devs/examio/examio-fe/src/pages/k/{MyMaterialsPage,ManageQuizSetDetailPage}.tsx`, `/Users/tgiap.dev/devs/examio/examio-fe/src/components/organisms/ShareFlashcardModal.tsx` (extracted parts + delta API), `/Users/tgiap.dev/devs/examio/examio-fe/src/routes/index.tsx` <!-- Red Team: RT-15 -->
- Delete: `generateShareLinkApi` usage for students in `studentMaterialsApi.ts` (keep the function if the teacher flow uses it [UNVERIFIED]).

## Implementation Steps
1. Write the BE unit tests and ownership e2e specs (red), see Tests. <!-- Red Team: RT-7 -->
2. Prisma changes (3 models) + `yarn prisma:merge && prisma migrate dev --name quiz_sharing`. <!-- Red Team: RT-15 -->
3. `sharing-list.util.ts`: `applyDelta`, `appendCodeGranted`, `clearCodeGranted`, `SHARE_LIST_CAP`. Fixed table enum, `$executeRaw`/`$queryRaw` tagged templates, delta applied inside `prisma.$transaction`. <!-- Red Team: RT-15 -->
4. `quizset-access.ts` (`canAccessQuizSet`, single `findFirst` select `{userId,isPublic,whitelist,codeGrantedIds}`), `quizset-owner.resolver.ts`, `QuizSetSharingService` + controller (declared perms; covered by the 06 declaration test).
5. `quiz-practice` module:
   - repository (explicit selects);
   - mapper (strip `isCorrect`/answer fields pre-submit; whitelisted fields);
   - scoring (pure function, unit-tested);
   - service (resume/create, autosave guard, submit in tx with `isSubmitted=false` precondition → 409 otherwise);
   - `unlock` via `verifyAccessCodeOrThrow` + `appendCodeGranted`. <!-- Red Team: RT-4 -->
   - append the 5 handlers to `AUTHENTICATED_ALLOWLIST` with the spec link. <!-- Red Team: RT-6 -->
6. Flashcard sets: delta `PUT :id/sharing`, `GET` with `codeGranted`, rotating `generate-code`, `with-code` → `appendCodeGranted`, access predicate. Exam sessions: cap, eviction on any code change, `with-code` + attempt `start` → `appendCodeGranted`, access predicates. All code generation via one `generateAccessCode()` (`crypto.randomInt(0, 1e6)` zero-padded) next to `access-code-guard.ts`. <!-- Red Team: RT-15 -->
7. Gateway route: ensure `/api/v1/quiz-practice` → exam upstream exists in `config/routes.yaml` (pre-declared by 05), including the `*/unlock` rate limit. <!-- Red Team: RT-4 -->
8. FE:
   - `quizPracticeApi.ts`, store (cache granted list per CLAUDE.md; invalidate on unlock/submit);
   - `lib/quiz-practice/progress.ts` (pure: build autosave payload, resume index);
   - page + components; route;
   - MyMaterials section + share-link fix.
9. FE teacher: extract `WhitelistUserPicker` (emits `{added, removed}`), `CodeGrantedList`, `AccessCodeSection` from `ShareFlashcardModal`; switch `flashcardSetApi` sharing calls to the delta body; build `ShareQuizSetModal`; add the button in `ManageQuizSetDetailPage`. <!-- Red Team: RT-15 -->
10. Manual: teacher shares by whitelist and by code, student practices, resumes after reload, submits, sees history. Re-opening a code link does not ask for the code again. Teacher regenerates the code → that student is asked again; a whitelisted student is not. 5 wrong codes → locked message. <!-- Red Team: RT-4, RT-15 -->

## Tests
- Write first (BE unit, `apps/exam-service/src/modules/...spec.ts`):
  - `quizset-sharing.service.spec.ts`: non-owner → 404; `generate-code` keeps whitelist and clears `codeGrantedIds`; `codeEnabled:false` clears code + `codeGrantedIds`; `isPublic` toggle keeps both lists; an array of 2001 ids → 400; a delta that ends above 2000 → 409 `SHARE_LIST_FULL`; response lists have no email. <!-- Red Team: RT-15 -->
  - `quiz-practice.service.spec.ts`:
    - no grant → 404;
    - TEACHER owner can start (preview), TEACHER non-owner → 403;
    - start twice → same attempt;
    - pre-submit payload has no answer keys at any depth;
    - submit computes the score from DB (client `score` ignored);
    - double submit → 409;
    - `unlock` with a wrong code 5 times → 429 `CODE_LOCKED`; correct code after rotation → old code rejected. <!-- Red Team: RT-4, RT-15 -->
  - `quiz-practice-scoring.spec.ts`: table-driven (all correct, none, unanswered, multi-answer [UNVERIFIED question shape — read `DetailsQuizQuestion`/`QuizQuestion` first]).
  - `sharing-list.util.spec.ts` (Postgres e2e) <!-- Red Team: RT-15 -->: two concurrent unlocks → user id present once; a concurrent `applyDelta(add A)` and `applyDelta(add B)` → both present (no lost update); `remove` of a code-granted user removes it from `codeGrantedIds`; append at 2000 → 409.
- <!-- Red Team: RT-7 --> Cross-user (`apps/exam-service/test/ownership/quiz-practice.ownership.e2e-spec.ts`, two STUDENTs A and B both granted the same set; titles carry the allowlist keys):
  - B `GET /quiz-practice/attempts/:idA` → 404;
  - B `PUT /quiz-practice/attempts/:idA` → 404, A's row unchanged;
  - B `POST /quiz-practice/attempts/:idA/submit` → 404;
  - B `GET /quiz-practice/attempts?quizSetId=…` → only B's rows (A's history not visible);
  - TEACHER non-owner `POST /quiz-practice/attempts` → 403; anonymous on every attempt route → 401.
- <!-- Updated: Validation Session 1 - demotion keeps content --> Append to `apps/exam-service/test/ownership/demoted-owner.ownership.e2e-spec.ts` (06): a whitelisted STUDENT can still `GET /quiz-practice/sets` / start an attempt on a quiz set whose TEACHER owner was demoted; `quizset-access.ts` reads only `isPublic`/`whitelist`/code-granted/`ownerId` (never the owner's role).
- <!-- Red Team: RT-7 --> `sharing.ownership.e2e-spec.ts`: TEACHER B `GET/PUT /quizsets/:idA/sharing`, `POST :idA/generate-code` → 404; same for `/flashcardsets/:idA/*`.
- BE e2e (`apps/exam-service/test/quiz-practice.e2e-spec.ts`): teacher creates set → share via code → student unlock → granted list includes set → start → autosave → submit → history 1 row → teacher regenerates code → set leaves the student's granted list. <!-- Red Team: RT-15 -->
- FE: none here (no FE test runner until 09). Phase 09 writes `src/lib/quiz-practice/progress.test.ts`. <!-- Red Team: RT-11 -->

## Todo List
- [x] BE tests + ownership specs red <!-- Red Team: RT-7 --> (evidence: phase-07-runs.md, RED unit 5 suites / RED e2e 4 suites)
- [x] Prisma: QuizSet sharing fields, `codeGrantedIds` on 3 models, GIN indexes, attempt index; migration <!-- Red Team: RT-15 --> (migrate deploy + drift check exit 0)
- [x] sharing-list.util (atomic delta, code-granted append/clear, cap 2000) <!-- Red Team: RT-15 --> (concurrency case in sharing.ownership e2e, green)
- [x] QuizSet sharing endpoints (owner, delta PUT) + users/search (sharing.ownership e2e, gateway smoke)
- [x] quiz-practice module (sets, access, unlock with lockout, attempts CRUD, submit, history) + allowlist entries <!-- Red Team: RT-4, RT-6 --> (handler-declarations, authz 250/250)
- [x] Code remembering via `codeGrantedIds` for flashcard, exam session, attempt start; eviction on rotate/disable; crypto codes <!-- Red Team: RT-15 --> (mutation table all KILLED; grep Math.random none)
- [x] Flashcard sharing on the delta API (BE + FE) <!-- Red Team: RT-15 --> (ui-browser-run-flashcard.txt 5/5)
- [x] FE practice page + store + api + route (ui-browser-run.txt 21/21)
- [x] FE MyMaterials granted section + student share-link fix (MyMaterialsPage.tsx:269 builds link client-side; check 15)
- [x] FE ShareQuizSetModal + extracted share components (ui-browser-run.txt checks 1-4, 18)
- [ ] e2e + manual flow — e2e green (exam-service 203/203). OPEN: manual "sees history" step not in browser run (no history check in run.cjs); history tab exists at QuizPracticePage.tsx. Needs a browser check or an explicit waiver.

## Success Criteria
- `cd examio-be && yarn typecheck && yarn build:all && yarn test`: exit 0. `cd examio-be/apps/exam-service && ../../node_modules/.bin/jest --config test/jest-e2e.json test/quiz-practice.e2e-spec.ts test/ownership`: exit 0. <!-- Red Team: RT-7 -->
- `cd examio-fe && yarn build && yarn lint`: exit 0. <!-- Red Team: RT-11 -->
- Network tab during practice: no response before submit contains `isCorrect`/correct-answer fields.
- A student who entered a code once opens the set again → no code prompt. After the teacher regenerates the code → prompt again. <!-- Red Team: RT-15 -->
- `grep -rn "Math.random" examio-be/apps/exam-service/src/modules/{flashcardset,examsession,quizset}` → none. <!-- Red Team: RT-15 -->
- Phase-06 `handler-declarations.spec.ts` passes with the new controllers and allowlist entries. <!-- Red Team: RT-6 -->

## Risk Assessment
- Question/answer shape unknown in detail → read `exam.prisma` Quiz models before step 5; scoring stays a pure function so the shape change is local.
- <!-- Red Team: RT-15 --> List growth (codes shared widely) → one cap of 2000 per list on all three resources; beyond it, 409 `SHARE_LIST_FULL`. Revisit a join table later (YAGNI now).
- <!-- Red Team: RT-15 --> Changing the flashcard sharing contract breaks an old FE build during deploy → Medium/Low. FE and BE reach production together in the single final-merge deploy (no old FE build runs against the new BE); mobile is unreleased and must reach parity before its first store release (P18). <!-- Updated: Validation Session 1 - single production deploy; mobile unreleased -->
- <!-- Red Team: RT-15 --> Existing flashcard/exam users who unlocked by code before this phase are not in `codeGrantedIds` → they enter the code once more. Acceptable (DB reset).
- Route collision under `/quizsets` → sharing endpoints use `:id/sharing`, `:id/generate-code`, `users/search` (no conflict with `:id`). Practice uses its own prefix.
- `ShareFlashcardModal` refactor regresses the teacher flashcard share → extraction plus the delta API switch; manual check of flashcard sharing (add, remove, code on/off, regenerate). <!-- Red Team: RT-15 -->

## Rollback
- BE: revert the quiz-practice module + sharing commits. The DB migration is additive except dropping the unused unique, so a revert migration re-adds it and drops `codeGrantedIds` (DB reset acceptable). <!-- Red Team: RT-15 -->
- The flashcard delta API and its FE modal change are one commit; revert them together. <!-- Red Team: RT-15 -->
- FE: revert the page/route commit. MyMaterials share-link fix is an independent commit.

## Security Considerations
- Codes: 6 digits from `crypto.randomInt`, constant-time compare, per-user-per-resource lockout (06), gateway rate limit (05). Codes never returned to non-owners. <!-- Red Team: RT-4 -->
- Rotating or disabling a code revokes every code-granted user at once. <!-- Red Team: RT-15 -->
- Ownership in `where` (404). Sharing data only for the owner. Attempts readable and writable only by their owner (cross-user specs). <!-- Red Team: RT-7 -->
- Server-side scoring only. Submitted attempts are immutable.
- Unlock requires login + `quiz:practice`, so anonymous code brute force is not possible.

## Next Steps
- Unblocks 09 (route guards for `/k/practice-quiz/:id`, sidebar, `progress.test.ts`), 14 (content-service takes quiz-practice + sharing). <!-- Red Team: RT-11 -->
- [CROSS-PHASE] `/api/v1/quiz-practice` (incl. `*/unlock` `rateLimit`) must exist in `apps/gateway-service/config/routes.yaml`. Phase 05 pre-declares it. If 05 lands after 07, add it there. <!-- Red Team: RT-4 -->
- [CROSS-PHASE] <!-- Red Team: RT-15 --> Exam session `PUT :id/sharing` / `ExamSessionFormModal` stay full-replace. Phase 14 (assessment extraction) may move them to the delta contract with `sharing-list.util.ts`.
- [CROSS-PHASE] `src/routes/index.tsx` is also touched by phase 08 (`/admin/roles`). 07 owns the file during its window; 08's one-line route registration must land after 07 merges (or the lead serialises the two).

### Deferred / carried (closed 2026-10-20)
1. P09: the axios interceptor (`src/apis/api.ts`) drops `status` and `code` on errors. Quiz-practice calls use `validateStatus` + `unwrap()` (`src/lib/quiz-practice/api-failure.ts`). Fix once in `api.ts`, then remove the workaround. Owner: P09 lead.
2. P09: the gateway limits `GET /auth/me` to 100/min, and a 429 sends the FE to `/login`. Review FE call frequency and the limit. Owner: P09 lead.
3. P09: apply `evidence/phase-07/response-shape-changes.md` (new quiz-practice and quizset sharing routes, delta sharing body incl. `removeCodeGrantedIds`, no emails). Owner: P09 lead.
4. Flashcard sets and exam sessions still add whitelisted users to `codeGrantedIds` on unlock. Harmless with `removeCodeGrantedIds`; align later. Owner: lead to assign (proposed P14).
5. Attempts submitted before `resultSnapshot` fall back to re-scoring. The DB reset makes this moot; remove the fallback then. Owner: lead to assign.
6. `/k/*` pages use hard-coded Vietnamese (no i18n). Decide in P09 whether to move them to i18n. Owner: P09 lead.
7. E2E specs over 200 lines: `quiz-practice.e2e-spec.ts`, `sharing.ownership.e2e-spec.ts`. Split them. Owner: lead to assign.
