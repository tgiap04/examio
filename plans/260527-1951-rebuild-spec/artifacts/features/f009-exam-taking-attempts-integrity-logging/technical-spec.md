# F009 - Exam Taking, Attempts & Integrity Logging Technical Spec

## Functional Requirements
- FR001: Let a student join an exam session through the standalone exam entry route when session/link/code access is accepted.
- FR002: Start or resume an exam attempt and persist answer progress, current question index, marked questions, score, violation count, and attempt status.
- FR003: Deliver secure quiz payloads for active attempts; encrypted payload/JWT-per-question behavior is cited but exact route and crypto contract Need verification.
- FR004: Submit final answers and calculate attempt result/history through exam attempt APIs.
- FR005: Capture integrity events from the web proctoring hook, including tab switch, window blur, devtools, copy/paste, right-click, fullscreen exit, and print-screen signals.

## Business Rules
- BR001: Only an exam participant/session client with valid access may take an exam or log cheating violations. Linked FR: FR001, FR005.
- BR002: Exam session lifecycle, access code/whitelist/sharing, passing score, and retake rules influence whether attempts can start or continue; detailed transitions Need verification. Linked FR: FR001, FR002.
- BR003: Standalone web exam routes are not ProtectedRoute-wrapped; API/session/code authorization is the enforcement point. Linked FR: FR001.
- BR004: Anti-cheating penalties, thresholds, and lockout/end-exam behavior Need verification. Linked FR: FR005.

## State Machines
- SM001: Exam session access: entry route opened -> session loaded -> access verified -> quiz route allowed or denied. Linked FR: FR001.
- SM002: Attempt lifecycle: not started -> started/resumed -> in progress -> submitted/result. Exact backend statuses Need verification. Linked FR: FR002, FR004.
- SM003: Integrity lifecycle: signal detected -> cheating log API called -> violation count updated -> user continues or session action occurs. Threshold behavior Need verification. Linked FR: FR005.

## Algorithms
- ALG001: Secure quiz retrieval should avoid exposing full answer data before submission; current artifacts cite encrypted quiz payloads and client AES helpers, but exact validation/decryption path Needs verification. Linked FR: FR003.
- ALG002: Scoring compares submitted answers against quiz answers and stores score/result in ExamAttempt; exact partial-credit behavior Needs verification. Linked FR: FR004.

## Integrations
- INT001: Web routes `/exam-session/:id` and `/exam-session/:id/quiz` drive session entry and quiz taking. Linked FR: FR001-FR004.
- INT002: Exam Rooms/Sessions/Attempts API (API005) includes `/api/v1/examsessions/:id/join` and exam attempt start/resume/submit routes; exact path list Needs verification. Linked FR: FR001-FR004.
- INT003: Proctoring API (API015) logs cheating violations; route naming mismatch `/cheatinglog` vs `/cheatinglogs/*` Needs verification. Linked FR: FR005.
- INT004: Mobile shared KMP `ExamAttemptApiService` exists, while Android/iOS exam quiz UI is mock-backed. Linked FR: FR002-FR004.

## Key Entities
- MODEL019 ExamSession: status, timestamps, assessType, accessCode, whitelist, passingScore, allowRetake.
- MODEL020 ExamAttempt: score, answers, currentIndex, markedQuestions, violationCount, status.
- MODEL021 CheatingLog: attempt-linked violation type such as TAB_SWITCH, WINDOW_BLUR, DEVTOOLS_OPEN.

## Artifact References
- `feature-list.md` F009.
- `user-stories.md` US012, US013.
- `screen-list.md` SCR031, SCR032.
- `screen-flow.md` FLW033, FLW034.
- `behavior-logic.md` BL041, BL043, BL044, BL046.
- `api-map.md` API005, API015.
- `permissions.md` PERM028.
- Source paths cited by artifacts: web `useCheatingDetection`, `cheatingLogApi.ts`, `examSessionApi.ts`, `examAttemptApi.ts`; exact source paths Need verification.
