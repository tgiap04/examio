# Quickstart: Migrate Frontend to Vite

## Goal

Use this guide to execute and validate the frontend migration work for `001-migrate-fe-vite`.

## Prerequisites

- Work on branch `001-migrate-fe-vite`
- Use the existing `examio-fe/` frontend as the migration target
- Keep backend APIs available so auth and feature flows can be exercised

## Execution Order

1. Inventory the current frontend capability surface.
   - Map all in-scope routes under the current frontend.
   - Group them into public, auth, protected `/k`, exam-session, and study-flashcard areas.
   - Mark P1 flows that must remain working throughout migration.
   - Current migration inventory scaffold:
     - Public: `/`, `/about`, `/contact`
     - Auth: `/login`, `/register`, `/forgot-password`, `/reset-password`
     - Protected `/k` baseline: `/k`, `/k/dashboard-student`, `/k/dashboard-teacher`, `/k/profile`, `/k/verify`, `/k/subscription`
     - Expanded `/k` coverage: `/k/my-materials`, `/k/flash-card`, `/k/history`, `/k/history/exam`, `/k/history/pdf`, `/k/ai-teacher`
     - Study route coverage: `/study-flashcard/:id`
     - Management route coverage: `/k/manage-exam`, `/k/manage-quiz-set/:id`, `/k/manage-flashcard-set/:id`, `/k/manage-exam-room`, `/k/manage-exam-room/:id`, `/k/manage-exam-room/:id/session/:sessionId`
     - AI route coverage: `/k/ai-tool`, `/k/ai-teacher`
     - Exam-session route coverage: `/exam-session/:id`, `/exam-session/:id/quiz`
     - Student exam history coverage: `/k/my-exams`
     - Legacy Next runtime page entrypoints have been removed from migrated frontend slices; active routing now runs through the Vite router
     - Latest validation evidence: `pnpm lint` passes with one pre-existing `LabelManager` warning, and `pnpm build` succeeds on the migrated Vite app

2. Establish the new application shell.
   - Replace the current page-entry structure with a client-routed application shell.
   - Preserve route intent and nested layout expectations.
   - Introduce explicit protected-route handling and redirect-back behavior.

3. Preserve integration and state behavior.
   - Keep the existing API-wrapper pattern as the default integration layer.
   - Keep Zustand stores as the default shared state pattern unless a store must change for migration reasons.
   - Reconfirm session initialization, invalid-session handling, and logout behavior.

4. Remove framework-specific dependencies.
   - Replace navigation, link, image, metadata, font, and route-param behaviors that depend on the old framework.
   - Review shared components first, then page-level usage.

5. Validate parity by capability.
   - Verify sign-in and sign-out flows.
   - Verify protected `/k` entry and role-sensitive navigation.
   - Verify dashboards, AI/study features, profile/subscription, materials/history, study-flashcard, and exam-session flows.
   - Document any approved fallback behavior.

## Suggested Work Batches

### Batch 1: Foundations
- Routing shell
- Shared layouts/navigation
- Protected-route model
- Session bootstrap

### Batch 2: Public and Auth
- Landing pages
- Login/register/forgot/reset flows
- Redirect-back behavior

### Batch 3: Protected Product Areas
- `/k` shell
- Dashboards
- Profile, verify, subscription
- Materials and history

### Batch 4: Learning and AI
- Quiz/flashcard management
- AI tool and AI teacher
- Study flashcard flow

### Batch 5: Exam Journeys
- Exam-room management views
- Exam-session flows
- Recovery behavior for deep links and refreshes

## Validation Checklist

- All P1 routes are reachable
- Protected routes redirect correctly when unauthenticated
- Authenticated users can re-enter intended routes after sign-in where expected
- Invalid sessions are cleared and redirected safely
- No in-scope route produces a blank or orphaned screen
- Approved fallback behaviors are documented before release
