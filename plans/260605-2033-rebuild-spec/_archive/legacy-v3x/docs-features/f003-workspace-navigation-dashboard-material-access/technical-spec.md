# F003 - Workspace Navigation, Dashboard & Material Access Technical Spec

## Functional Requirements
- FR001: The system shall protect `/k/*` workspace routes from unauthenticated web users.
- FR002: The system shall provide an authenticated workspace shell with sidebar/header/search/theme controls and verification banner support.
- FR003: The system shall route authenticated users from `/k` to the workspace destination. Exact destination Needs verification.
- FR004: The system shall show recent student materials through `/k/my-materials` using student materials APIs.
- FR005: The system shall support pin/unpin/share access for student materials where exposed by the student materials API. Exact backend route list Needs verification.
- FR006: The system shall show history overview, exam history, and PDF/upload/generation history through history routes.
- FR007: The system shall cache API-backed material/history data in frontend stores and invalidate on create/update/delete mutations.
- FR008: Mobile home/history/study tabs shall represent the workspace concept, but non-auth mobile feature screens are currently mostly mock-backed.

## Business Rules
- BR001: Workspace access requires authentication.
- BR002: Student material views are scoped to the authenticated user and accessible materials.
- BR003: Pinned/shared material behavior must respect backend ownership/access rules; exact sharing rules Need verification.
- BR004: Mobile non-auth feature UIs must not be treated as production API-backed behavior until repository wiring is verified.

## State Machines
- SM001 Workspace route state: unauthenticated -> redirect to login with return path; authenticated -> render KLayout and target screen.
- SM002 Material cache state: empty -> loading -> loaded -> stale after mutation -> revalidated.
- SM003 History view state: overview -> exam history or PDF history -> detail if available. Exact detail routes Need verification.

## Algorithms
- ALG001: ProtectedRoute stores intended destination before redirecting unauthenticated users to `/login`.
- ALG002: Zustand store cache reduces repeated API calls during a session and invalidates when user mutates data.
- ALG003: Axios refresh logic handles expired sessions for material/history API requests.

## Integrations
- INT001: Web workspace routes use KLayout and route guards.
- INT002: Student materials use `/api/v1/student/*` and `studentMaterialsApi.ts`.
- INT003: History uses `/api/v1/examattempts/*` and `/api/v1/ai/*` via `historyApi.ts` and stats store.
- INT004: Recent uploads/history can read AI upload/generation endpoints.
- INT005: Mobile shared KMP repositories exist for history/student materials, but platform UIs are mostly mock-backed.

## Key Entities
- MODEL010 `QuizSet`
- MODEL014/MODEL015 `FlashCardSet` naming discrepancy Needs verification in artifacts
- MODEL018/MODEL020 `ExamAttempt` naming discrepancy Needs verification in artifacts
- MODEL024/MODEL027 `UserStorage` naming discrepancy Needs verification in artifacts
- MODEL021/MODEL025 `HistoryGeneratedQuizz` naming discrepancy Needs verification in artifacts
- MODEL022/MODEL026 `HistoryGeneratedFlashcard` naming discrepancy Needs verification in artifacts

## Artifact References
- `feature-list.md` F003
- `user-stories.md` US005, US010, US019
- `screen-list.md` SCR012, SCR016, SCR018-SCR020, SCR107, SCR112-SCR113, SCR207, SCR209
- `screen-flow.md` FLW010-FLW012, FLW023, FLW041, FLW053, FLW105, FLW108, FLW205-FLW206
- `behavior-logic.md` BL003-BL006, BL030-BL033, BL053, BL070-BL073
- `api-map.md` API006, API009, API010
- `permissions.md` PERM008, PERM022, PERM031, PERM040
- Source paths: `examio-fe/src/apis/studentMaterialsApi.ts`, `examio-fe/src/apis/historyApi.ts`, related Zustand stores; exact screen files Need verification.
