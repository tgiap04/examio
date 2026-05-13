# Tasks: Migrate Frontend to Vite

**Input**: Design documents from `/specs/001-migrate-fe-vite/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Frontend automated tests were not explicitly requested in the feature specification, so this task list focuses on executable implementation and parity validation tasks.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Frontend application root: `examio-fe/`
- Main source paths: `examio-fe/src/app`, `examio-fe/src/components`, `examio-fe/src/apis`, `examio-fe/src/stores`, `examio-fe/src/hooks`, `examio-fe/src/lib`, `examio-fe/src/provider`, `examio-fe/src/types`
- Planning artifacts: `specs/001-migrate-fe-vite/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the migration baseline and target application structure.

- [X] T001 Create the Vite-based frontend entry structure in `examio-fe/package.json`, `examio-fe/index.html`, `examio-fe/src/main.tsx`, and `examio-fe/src/App.tsx`
- [X] T002 [P] Update frontend TypeScript and bundler configuration in `examio-fe/tsconfig.json`, `examio-fe/vite.config.ts`, and `examio-fe/eslint.config.mjs`
- [X] T003 [P] Create the route capability inventory scaffold in `specs/001-migrate-fe-vite/quickstart.md` and `specs/001-migrate-fe-vite/contracts/frontend-routing-auth-contract.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the routing, auth, and app-shell foundation required by all user stories.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Create the shared app provider and root shell composition in `examio-fe/src/main.tsx`, `examio-fe/src/App.tsx`, and `examio-fe/src/provider/`
- [X] T005 Implement the client route tree and layout replacement for legacy `src/app` structure in `examio-fe/src/routes/index.tsx` and `examio-fe/src/routes/layouts/`
- [X] T006 [P] Implement public, protected, and role-aware route guards in `examio-fe/src/routes/guards/ProtectedRoute.tsx`, `examio-fe/src/routes/guards/PublicRoute.tsx`, and `examio-fe/src/routes/guards/TeacherRoute.tsx`
- [X] T007 [P] Refactor auth session bootstrap and redirect-back behavior in `examio-fe/src/stores/useAuthStore.ts`, `examio-fe/src/hooks/useAuthSync.ts`, and `examio-fe/src/lib/authRedirect.ts`
- [X] T008 Refactor shared Axios session failure handling and environment usage in `examio-fe/src/apis/api.ts` and `examio-fe/src/lib/env.ts`
- [X] T009 Replace Next.js-only navigation utilities with framework-agnostic helpers in `examio-fe/src/lib/navigation.ts` and shared consumers under `examio-fe/src/components/`
- [X] T010 Remove obsolete Next.js runtime files after replacement readiness in `examio-fe/src/middleware.ts`, `examio-fe/src/app/layout.tsx`, and `examio-fe/src/app/`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel.

---

## Phase 3: User Story 1 - Preserve core learning flows after migration (Priority: P1) 🎯 MVP

**Goal**: Keep sign-in, protected navigation, and main learning flows usable in the migrated frontend.

**Independent Test**: Start the migrated frontend, sign in with an existing account, enter protected `/k` areas, and complete one representative learning flow plus one protected direct-link entry without blocking errors.

### Implementation for User Story 1

- [X] T011 [P] [US1] Migrate auth route pages for login, register, forgot password, and reset password in `examio-fe/src/pages/auth/` using logic from `examio-fe/src/app/(auth)/`
- [X] T012 [P] [US1] Migrate public landing routes and shared unauthenticated layout in `examio-fe/src/pages/landing/` and `examio-fe/src/routes/layouts/PublicLayout.tsx`
- [X] T013 [US1] Migrate protected `/k` shell and authenticated redirect entry in `examio-fe/src/pages/k/KRootRedirect.tsx`, `examio-fe/src/routes/layouts/KLayout.tsx`, and related navigation components from `examio-fe/src/app/k/layout.tsx` and `examio-fe/src/app/k/page.tsx`
- [X] T014 [P] [US1] Migrate dashboard and profile-access routes in `examio-fe/src/pages/k/dashboard-student/`, `examio-fe/src/pages/k/dashboard-teacher/`, `examio-fe/src/pages/k/profile/`, `examio-fe/src/pages/k/verify/`, and `examio-fe/src/pages/k/subscription/`
- [X] T015 [P] [US1] Migrate study-content access flows for materials and flashcard study in `examio-fe/src/pages/k/my-materials/`, `examio-fe/src/pages/study-flashcard/`, `examio-fe/src/apis/studentMaterialsApi.ts`, and `examio-fe/src/apis/flashcardStudyApi.ts`
- [X] T016 [US1] Migrate representative learning flows for AI teacher and flash-card usage in `examio-fe/src/pages/k/ai-teacher/`, `examio-fe/src/pages/k/flash-card/`, `examio-fe/src/stores/useAITeacherStore.ts`, and `examio-fe/src/stores/useFlashcardSetStore.ts`
- [X] T017 [US1] Validate protected deep-link entry, redirect-back, and session invalidation behavior across migrated auth and `/k` flows in `specs/001-migrate-fe-vite/quickstart.md`

**Checkpoint**: User Story 1 should be fully functional and testable independently.

---

## Phase 4: User Story 2 - Keep feature parity for internal product teams (Priority: P2)

**Goal**: Preserve the in-scope route inventory, backend-connected feature behavior, and parity review evidence for stakeholders.

**Independent Test**: Compare the current in-scope route list against the migrated frontend, then walk through the agreed parity checklist for dashboards, AI features, history, materials, profile/subscription, and exam-management views.

### Implementation for User Story 2

- [X] T018 [P] [US2] Build the migrated route inventory and parity matrix in `specs/001-migrate-fe-vite/quickstart.md`, `specs/001-migrate-fe-vite/data-model.md`, and `specs/001-migrate-fe-vite/contracts/frontend-routing-auth-contract.md`
- [X] T019 [P] [US2] Migrate history, profile-adjacent, and subscription-support feature pages in `examio-fe/src/pages/k/history/`, `examio-fe/src/pages/k/history/exam/`, `examio-fe/src/pages/k/history/pdf/`, `examio-fe/src/apis/historyApi.ts`, and `examio-fe/src/apis/subscriptionApi.ts`
- [X] T020 [P] [US2] Migrate teacher management flows for quiz sets, flashcard sets, and exam management in `examio-fe/src/pages/k/manage-quiz-set/`, `examio-fe/src/pages/k/manage-flashcard-set/`, `examio-fe/src/pages/k/manage-exam/`, and related APIs/stores under `examio-fe/src/apis/` and `examio-fe/src/stores/`
- [X] T021 [P] [US2] Migrate AI tool, virtual teacher, and related feature integrations in `examio-fe/src/pages/k/ai-tool/`, `examio-fe/src/apis/aiApi.ts`, `examio-fe/src/apis/aiChatApi.ts`, `examio-fe/src/apis/virtualTeacherApi.ts`, `examio-fe/src/stores/useAIGeneratorStore.ts`, and `examio-fe/src/stores/useAITeacherStore.ts`
- [X] T022 [US2] Migrate shared components that depend on `next/link`, `next/image`, or `next/navigation` in `examio-fe/src/components/` and align them with the new route/navigation contract
- [X] T023 [US2] Document approved fallback behaviors and unresolved parity deltas, if any, in `specs/001-migrate-fe-vite/research.md` and `specs/001-migrate-fe-vite/contracts/frontend-routing-auth-contract.md`

**Checkpoint**: User Stories 1 and 2 should both work independently, with parity evidence ready for stakeholder review.

---

## Phase 5: User Story 3 - Simplify frontend delivery and local development (Priority: P3)

**Goal**: Make the migrated frontend easy to run, build, and maintain with the new application setup.

**Independent Test**: From a fresh checkout, install dependencies, start the frontend locally, create a production build artifact, and confirm the documented workflow is sufficient without extra framework-specific steps.

### Implementation for User Story 3

- [X] T024 [P] [US3] Align frontend scripts, environment variables, and developer commands in `examio-fe/package.json`, `examio-fe/vite.config.ts`, and `examio-fe/.env.example` if present
- [X] T025 [P] [US3] Replace legacy App Router file organization with the new page and route structure in `examio-fe/src/pages/`, `examio-fe/src/routes/`, and remaining references under `examio-fe/src/app/`
- [X] T026 [US3] Remove or replace remaining Next.js-specific metadata, font, and runtime dependencies in `examio-fe/src/`, `examio-fe/package.json`, and shared UI entry files
- [X] T027 [US3] Update frontend developer workflow documentation and migration runbook in `specs/001-migrate-fe-vite/quickstart.md` and repository guidance files affected by the new setup
- [X] T028 [US3] Validate local run/build workflow and capture final developer acceptance notes in `specs/001-migrate-fe-vite/quickstart.md`

**Checkpoint**: All user stories should now be independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and cross-story validation.

- [X] T029 [P] Remove dead imports, obsolete helpers, and unused compatibility code in `examio-fe/src/`
- [X] T030 [P] Reconcile final capability status, fallback decisions, and release notes in `specs/001-migrate-fe-vite/spec.md`, `specs/001-migrate-fe-vite/plan.md`, and `specs/001-migrate-fe-vite/research.md`
- [X] T031 Run full lint and build validation for the migrated frontend in `examio-fe/package.json` workflows and record results in `specs/001-migrate-fe-vite/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion
- **User Story 2 (Phase 4)**: Depends on Foundational completion and should build on migrated routing/auth foundations from US1
- **User Story 3 (Phase 5)**: Depends on Foundational completion and is safest after major user-facing migrations are in place
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - MVP story
- **User Story 2 (P2)**: Can start after Foundational (Phase 2), but benefits from US1 route/auth patterns being established first
- **User Story 3 (P3)**: Can start after Foundational (Phase 2), but should finalize after core parity work to avoid churn

### Within Each User Story

- Shared shell and guards before route migration
- Route migration before feature-level parity validation
- Shared component replacement before final cleanup of legacy runtime files
- Capability documentation updated as each story reaches parity

### Parallel Opportunities

- T002 and T003 can run in parallel after T001
- T006 and T007 can run in parallel after T005 starts
- T011 and T012 can run in parallel for auth/public routes
- T014 and T015 can run in parallel once the `/k` shell is stable
- T018, T019, T020, and T021 can run in parallel across separate feature areas
- T024 and T025 can run in parallel before final cleanup work in US3
- T029 and T030 can run in parallel after all story phases complete

---

## Parallel Example: User Story 1

```bash
# Parallel route migration tasks for User Story 1:
Task: "Migrate auth route pages in examio-fe/src/pages/auth/ using logic from examio-fe/src/app/(auth)/"
Task: "Migrate public landing routes in examio-fe/src/pages/landing/ and examio-fe/src/routes/layouts/PublicLayout.tsx"

# Parallel protected feature tasks after K shell is stable:
Task: "Migrate dashboard and profile-access routes in examio-fe/src/pages/k/dashboard-student/, examio-fe/src/pages/k/dashboard-teacher/, examio-fe/src/pages/k/profile/, examio-fe/src/pages/k/verify/, and examio-fe/src/pages/k/subscription/"
Task: "Migrate study-content access flows in examio-fe/src/pages/k/my-materials/, examio-fe/src/pages/study-flashcard/, examio-fe/src/apis/studentMaterialsApi.ts, and examio-fe/src/apis/flashcardStudyApi.ts"
```

---

## Parallel Example: User Story 2

```bash
# Parallel parity implementation tasks for User Story 2:
Task: "Migrate history and subscription-support pages in examio-fe/src/pages/k/history/ and related API files"
Task: "Migrate teacher management flows in examio-fe/src/pages/k/manage-quiz-set/, examio-fe/src/pages/k/manage-flashcard-set/, examio-fe/src/pages/k/manage-exam/, and related stores/APIs"
Task: "Migrate AI tool and virtual teacher integrations in examio-fe/src/pages/k/ai-tool/ and related AI API/store files"
```

---

## Parallel Example: User Story 3

```bash
# Parallel delivery-simplification tasks for User Story 3:
Task: "Align frontend scripts and environment configuration in examio-fe/package.json, examio-fe/vite.config.ts, and examio-fe/.env.example"
Task: "Replace legacy App Router file organization with new route structure in examio-fe/src/pages/ and examio-fe/src/routes/"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Validate sign-in, protected navigation, and one representative learning flow
5. Stop and review before expanding parity scope

### Incremental Delivery

1. Complete Setup + Foundational to establish the migration shell
2. Deliver User Story 1 for core auth and learning flow parity
3. Deliver User Story 2 for broader product parity and stakeholder review coverage
4. Deliver User Story 3 for workflow simplification and cleanup
5. Finish with Polish for final validation and release readiness

### Parallel Team Strategy

With multiple developers:

1. One developer handles app shell and routing foundations
2. One developer migrates auth/public flows and protected `/k` shell
3. One developer migrates feature-heavy domains such as management, AI, and history after the foundation stabilizes
4. One developer verifies parity inventory, fallback documentation, and local workflow validation

---

## Notes

- All tasks follow the required checklist format with task ID, optional `[P]`, story label where applicable, and exact file paths.
- No dedicated automated test-writing tasks were added because the specification did not require a TDD or automated frontend test track.
- The suggested MVP scope is **User Story 1** after completing Setup and Foundational phases.
- Keep diffs focused on frontend migration work inside `examio-fe/` and the supporting planning artifacts under `specs/001-migrate-fe-vite/`.
