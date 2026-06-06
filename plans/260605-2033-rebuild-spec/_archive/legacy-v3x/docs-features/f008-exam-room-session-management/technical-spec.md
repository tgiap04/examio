# F008 Technical Spec - Exam Room & Session Management

## Functional Requirements
- FR001: Authenticated teacher/owner users can create, list, view, update, and delete exam rooms.
- FR002: Room managers can create and configure exam sessions under a room.
- FR003: Session settings include schedule, lifecycle status, access code, whitelist/sharing, passing score, assessment type, and retake rules where supported.
- FR004: Managers can start/update sessions and configure sharing/access.
- FR005: Managers can view session analytics for attempts and cheating logs.
- FR006: Student exam list can link learners to available exam sessions.
- FR007: Mobile teacher/exam screens exist but are mock-backed; shared APIs exist.

## Business Rules
- BR001: Exam room/session management requires authentication and ownership. Source: PERM023, PERM024.
- BR002: Teacher/admin intent exists, but frontend TeacherRoute only checks authentication; backend role enforcement Needs verification. Source: BL008, PERM023.
- BR003: Session analytics are intended for room owners/teacher/admin users; exact enforcement Needs verification. Source: PERM025.
- BR004: Join/start exam behavior belongs to F009, but session access settings created here control that downstream flow.
- BR005: Session lifecycle state transitions and retake limits Need verification. Source: BL041.

## State Management
- SM001: Web uses `examRoomApi.ts`, `examSessionApi.ts`, and exam room/session stores for room/session management.
- SM002: Session analytics reads attempts and cheating logs for a selected session.
- SM003: Mobile shared `ExamRoomApiService` exists; Android/iOS teacher/exam screens are mock-backed.

## Algorithms
- ALG001: Room management creates a room linked to owner/host and selected quiz content.
- ALG002: Session configuration validates schedule/access/retake settings before publish/start.
- ALG003: Analytics aggregates attempts, scores, pass/fail, and violation data. Exact aggregation formulas Need verification.

## Integrations
- INT001: API005 `/api/v1/examrooms/*` for room CRUD.
- INT002: API005 `/api/v1/examsessions/*` for session CRUD/start/sharing.
- INT003: API005 `/api/v1/examattempts/*` for attempt data used in analytics.
- INT004: API015 cheating log API for proctoring analytics; singular/plural route mismatch Needs verification.
- INT005: API010 student materials may surface available exams.

## Key Entities
- MODEL018 `ExamRoom`
- MODEL019 `ExamSession`
- MODEL020 `ExamAttempt`
- MODEL021 `CheatingLog`
- MODEL055 mobile `ExamRoomModels.kt`
- MODEL056 mobile `ExamAttemptModels.kt`

## Artifact References
- `feature-list.md` F008
- `user-stories.md` US011, US014
- `screen-list.md` SCR026, SCR027, SCR028, SCR029, SCR110, SCR111, SCR116, SCR210, SCR212
- `screen-flow.md` FLW030, FLW031, FLW034, FLW108, FLW206
- `behavior-logic.md` BL040-BL047, BL070-BL072
- `api-map.md` API005, API010, API015
- `permissions.md` PERM023-PERM028, PERM040
- Source paths: web `src/apis/examRoomApi.ts`, `src/apis/examSessionApi.ts`, `src/apis/examAttemptApi.ts`, `src/apis/cheatingLogApi.ts`; mobile `ExamRoomApiService`, `ExamAttemptApiService`; exact store/component files Need verification.
