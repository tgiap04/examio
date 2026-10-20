# Phase 07 response-shape and contract changes (for P09 FE, P14, P18 mobile)

Gateway paths are under `/api/v1`. All routes need a login except where marked.

## New: student practice (`/quiz-practice`, exam-service)

| Route | Who | Request | Response / errors |
|---|---|---|---|
| `GET /quiz-practice/sets?page&limit` | `quiz:practice` (STUDENT) | limit 1-50 | `{ sets: [{ id, title, description, thumbnail, questionCount, owner:{name}, lastAttempt: {id,isSubmitted,score\|null,updatedAt}\|null }], total, page, limit, totalPages }`. Granted = whitelist OR code-unlocked OR (public AND I already have an attempt). TEACHER 403. |
| `GET /quiz-practice/sets/:id/access` | auth-optional at the gateway and exam-service (invalid token ignored). Anonymous on a code-protected set gets ONLY `{ canAccess:false, requiresCode:true, reason:null }` (no `title`/`questionCount`: both are optional in the FE type) | | `{ title, questionCount, canAccess, requiresCode, reason: 'owner'\|'public'\|'whitelist'\|'code'\|null }`. A private set with no code and no grant is 404 (existence not revealed). Never returns the code or lists. |
| `POST /quiz-practice/sets/:id/unlock` | `quiz:practice` | `{ code }` | 200 `{ canAccess: true }` (the code is always checked; an owner, public or whitelisted caller is NOT added to the code-granted list); 400 `INVALID_CODE` / `INVALID_CODE_FORMAT`; 429 `CODE_LOCKED` `{ retryAfterSeconds }` (5 wrong in 900 s, a right code is refused while locked); 503 `CODE_CHECK_UNAVAILABLE`; 409 `SHARING_CHANGED` (code rotated during the call), 409 `SHARE_LIST_FULL`. Gateway also limits `*/unlock` to 5 per 60 s. |
| `POST /quiz-practice/attempts` | owner OR `quiz:practice` | `{ quizSetId }` | `{ attempt, questions: [{ id, question, options }] }` (201). Resumes the latest unsubmitted attempt, else opens one. No grant -> 404, TEACHER non-owner -> 403. **No answer fields.** |
| `GET /quiz-practice/attempts/:id` | any verified user, own attempts only (other user -> 404). **An OPEN attempt also needs the caller to still have access to the set (whitelist, current code, public, owner), otherwise 404** | | open: same shape as start. submitted: the snapshot taken at submit (`questions: [{ id, question, options, selectedAnswer, correctAnswer, isCorrect }]`; later edits to the set do not change it; a submitted attempt stays readable after access is lost) and `attempt.score` / `attempt.correctAnswers`. |
| `PUT /quiz-practice/attempts/:id` | own, open attempt | `{ answers: { [questionId]: "A"\|"B"\|...\|option text }, currentIndex, markedQuestions, timeSpentSeconds }` | 200 `{ saved: true }`; 400 on bad body; 404 (also when the set is no longer accessible); 409 `ALREADY_SUBMITTED`. |
| `POST /quiz-practice/attempts/:id/submit` | own | no body (a client score is ignored) | 200 `{ attempt, questions (with key + verdicts) }`; 409 `ALREADY_SUBMITTED`. Score 0-10 with 2 decimals, computed from the stored answers. |
| `GET /quiz-practice/attempts?quizSetId&page&limit` | any verified user | | `{ attempts: [{ id, quizSetId, score, totalQuestions, correctAnswers, timeSpentSeconds, startedAt, submittedAt, quizSet:{title} }], total, page, limit, totalPages }`, submitted only, newest first, always the caller's own. |

`attempt` view fields: `id, quizSetId, type, answers, currentIndex, markedQuestions, timeSpentSeconds, timeLimitMinutes, isSubmitted, totalQuestions, startedAt, submittedAt, updatedAt`, plus `score` and `correctAnswers` **only once submitted**.

The FE sends the option LETTER (`"A"`...) like the exam page; the server also accepts the option text.

## New: quiz set sharing (`/quizsets`, exam-service; TEACHER, owner only, others 404)

- `GET /quizsets/:id/sharing` -> `{ isPublic, accessCode, whitelist: [{id,username,name,avatar}], codeGranted: [{id,username,name,avatar}] }` (no email).
- `PUT /quizsets/:id/sharing` body `{ addUserIds?, removeUserIds?, removeCodeGrantedIds?, isPublic?, codeEnabled? }` (each array <= 2000, at least one field, else 400). One atomic statement. `removeUserIds` removes from whitelist AND code-granted; `removeCodeGrantedIds` (new) removes from the code-granted list ONLY (the whitelist grant stays; the FE code-granted list uses it). `codeEnabled:true` creates a code if none, `false` clears it and evicts code users. `isPublic` changes visibility only. Response = the GET shape. 409 `SHARE_LIST_FULL` when a list would exceed 2000. Ids that are not live accounts are ignored.
- `POST /quizsets/:id/generate-code` -> 200 `{ accessCode }` (6 digits, CSPRNG). Clears code-granted, keeps whitelist.
- `GET /quizsets/users/search?q=` (`user:search`; q >= 3 chars, max 10, no email).

## Changed: flashcard set sharing (same contract)

- `PUT /flashcardsets/:id/sharing` takes the delta body above (the old `{ isPublic, accessCode, whitelist }` full replace is gone: a body with any key other than the four delta keys is a 400 (not half-applied), and `isPublic` alone no longer wipes the whitelist or code).
- `GET /flashcardsets/:id/sharing` -> `{ isPublic, accessCode, whitelist: [person], codeGranted: [person] }` (was `{ id, isPublic, accessCode, whitelist: [person] }`).
- `PUT` response is now the GET shape (was `{ message, isPublic, accessCode, whitelist: string[] }`).
- `POST /flashcardsets/:id/generate-code` also clears code-granted users.
- `POST /flashcardsets/study/:id/with-code` now remembers the user: the next `GET /flashcardsets/study/:id` is 200 (no `CODE_REQUIRED`) until the code changes.
- `GET /flashcardsets/study/:id/access` can now return `accessType: 'code'`.

## Changed: exam session

- `POST /examsessions/study/:id/with-code` and `POST /examattempts/start` with a valid `accessCode` remember the user (`GET study/:id` -> 200 afterwards); `accessType: 'code'` possible on `GET study/:id/access`.
- `PUT /examsessions/:id/sharing` is still a full replace, but a whitelist above 2000 ids is 409 `SHARE_LIST_FULL`; `generate-code`, `PUT /examsessions/:id` or `PUT :id/sharing` with a different/null `accessCode` evict everyone who unlocked the old code.

## FE-visible removals

- `generateShareLinkApi` (`POST /flashcardsets/:id/share`) is no longer called; `MyMaterialsPage` copies `${origin}/study-flashcard/:id` client-side.
- `GET users/search` no longer returns `email`; the picker minimum is 3 characters (was 2).

## Gotcha for FE code

The shared axios interceptor turns every failed response into `Error(message)` and drops status and `code`. Calls that need `CODE_LOCKED`, `SHARE_LIST_FULL`, `ALREADY_SUBMITTED` pass `validateStatus: acceptDomainStatuses` (400/409/429) and `unwrap()` from `src/lib/quiz-practice/api-failure.ts`, which throws an `ApiFailure { status, code, retryAfterSeconds }`. 401/403/404/5xx still go through the interceptor. P09 may prefer to fix this once in `api.ts`.

## Schema

Migration `20261020132225_quiz_sharing` (regenerated, still uncommitted): `QuizPracticeAttempt.resultSnapshot Json?` (frozen per-question result written at submit); `QuizSet.accessCode|whitelist|codeGrantedIds` (+ GIN indexes on the two lists), `FlashCardSet.codeGrantedIds`, `ExamSession.codeGrantedIds`, `QuizPracticeAttempt` unique `(quizSetId,userId,type)` dropped and `(quizSetId,userId,isSubmitted)` index added.

## Scoring note (rework)

A single-letter stored key (`A`..`Z`) is read as a POSITION, for the key and for the pick, even when an option's text is that same letter. Text keys keep exact-then-letter-then-normalised matching.
