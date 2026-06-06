# FLOW003 - Exam Attempt Flow

## Purpose
Document the student exam-taking workflow across session entry, attempt lifecycle, secure quiz delivery, answer submission, and integrity logging.

## Actors/systems
- Student / exam participant
- Teacher or room host configuring sessions
- Web standalone exam routes `/exam-session/:id` and `/exam-session/:id/quiz`
- Exam session and attempt APIs
- Proctoring hook and cheating log API
- `ExamSession`, `ExamAttempt`, `CheatingLog`
- Mobile shared KMP exam APIs, with platform exam UI mostly mock-backed

## State transitions
- Session entry opened -> session loaded -> access code/link/whitelist validated -> quiz route allowed or denied.
- Attempt lifecycle: not started -> started/resumed -> in progress -> submitted/result. Exact backend statuses Need verification.
- Answer progress: question viewed -> answer saved/updated -> current index/marked questions updated -> final submit.
- Secure quiz lifecycle: active attempt -> secure/encrypted quiz payload delivered -> client renders questions -> answers submitted. Exact crypto contract Needs verification.
- Integrity lifecycle: proctoring signal detected -> cheating log API called -> violation count/stats updated -> continue or enforced consequence. Threshold behavior Needs verification.

## Trigger types
- User action: open session link, enter access code, start/resume attempt, answer question, mark question, submit.
- Route transition: session entry route to quiz route.
- Backend validation: access rules, retake rules, whitelist, session status, passing score.
- Client integrity signal: tab switch, window blur, devtools, copy/paste, right-click, fullscreen exit, print-screen.
- Submission trigger: final answer submission and scoring.

## Source artifact refs
- `feature-list.md` F008, F009
- `screen-flow.md` FLW030-FLW034
- `behavior-logic.md` BL040-BL047
- `data-model.md` MODEL018-MODEL021, MODEL038
- `features/f008-exam-room-session-management/technical-spec.md`
- `features/f009-exam-taking-attempts-integrity-logging/technical-spec.md`

## Edge cases / Needs verification
- Detailed `ExamSession` status transitions and allowed transitions.
- Exact join/start/resume/submit API paths and response shapes.
- Exact secure quiz encryption/JWT-per-question validation path.
- Partial credit, scoring rules, and result/history persistence details.
- Anti-cheating thresholds, lockout/end-exam consequences, and whether warnings are shown before enforcement.
- Teacher/admin authorization for managing rooms and sessions.
