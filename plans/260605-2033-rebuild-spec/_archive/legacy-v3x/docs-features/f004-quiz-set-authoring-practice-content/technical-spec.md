# F004 - Quiz Set Authoring & Practice Content Technical Spec

## Functional Requirements
- FR001: The system shall let authenticated users create quiz sets through `/api/v1/quizsets`.
- FR002: The system shall let users list, view, update, and delete accessible quiz sets.
- FR003: The system shall let owners manage questions within a quiz set through quiz set question routes.
- FR004: The system shall let owners assign/manage quiz set labels.
- FR005: The system shall support sharing/access rules for public, owned, or shared quiz sets where exposed by the backend. Exact public/shared rules Need verification.
- FR006: The system shall save generated quiz content/history from AI generation flows for later reuse.
- FR007: The system shall expose quiz set material to student material and exam/practice workflows.
- FR008: Mobile quiz/teacher screens shall represent quiz set management, but platform UI is mock-backed while shared KMP quiz APIs exist.

## Business Rules
- BR001: Authenticated users can create quiz sets and become the owner/manager.
- BR002: Owners can edit/delete their quiz sets, questions, and labels.
- BR003: Public/shared quiz visibility exists in model/API descriptions, but exact access rules Need verification.
- BR004: Generated quiz content must be saved against the appropriate user/upload/history record before reuse.
- BR005: Teacher-only expectations around quiz/exam authoring are implied by screens, but web TeacherRoute does not enforce teacher/admin role.

## State Machines
- SM001 Quiz set lifecycle: draft/created -> questions/labels edited -> published/shared or kept private -> updated/deleted. Exact status fields Need verification.
- SM002 Question lifecycle: added -> edited/labeled -> removed.
- SM003 Generated quiz lifecycle: file processed -> generated quiz returned -> saved to history -> converted/reused as quiz content. Exact conversion route Needs verification.

## Algorithms
- ALG001: Store cache should avoid repeated quiz set API calls and invalidate after create/update/delete/question mutations.
- ALG002: Export/editor behavior exists on web for quiz set detail, but exact export algorithm Needs verification.

## Integrations
- INT001: Gateway proxies `/api/v1/quizsets/*` to exam-service quiz set functionality.
- INT002: Web uses `quizsetApi.ts` and `useQuizSetStore`.
- INT003: Generated quiz history uses AI generation endpoints and Python generation routes indirectly through exam-service.
- INT004: Student materials can surface quiz/exam content through `/api/v1/student/*`.
- INT005: Exam room/session flows can use quiz sets as source content.
- INT006: Mobile shared KMP `QuizSetApiService` exists; mobile De Thi/teacher screens are mock-backed.

## Key Entities
- MODEL010 `QuizSet`
- MODEL011 `QuizSetLabel`
- MODEL012 `QuizQuestion`
- MODEL013 `DetailsQuizQuestion`
- MODEL014 `QuizPracticeAttempt` from `data-model.md`; feature-list uses MODEL013 for DetailsQuizQuestion and MODEL021 for HistoryGeneratedQuizz, which conflicts with data-model numbering. Needs verification.
- MODEL025 `HistoryGeneratedQuizz` per `data-model.md`; feature-list says MODEL021. Needs verification.

## Artifact References
- `feature-list.md` F004
- `user-stories.md` US006, US008
- `screen-list.md` SCR021-SCR022, SCR111, SCR116, SCR212
- `screen-flow.md` FLW020, FLW040, FLW105, FLW108, FLW206
- `behavior-logic.md` BL030, BL032, BL052, BL070-BL072
- `api-map.md` API003, API010, API006, API011
- `permissions.md` PERM015-PERM017, PERM030, PERM040
- Source paths: `kmaedu-fe/src/apis/quizsetApi.ts`, `kmaedu-fe/src/stores/useQuizSetStore.ts`; exact backend module/controller paths Need verification.
