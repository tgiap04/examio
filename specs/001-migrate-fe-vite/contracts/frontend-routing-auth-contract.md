# Contract: Frontend Routing and Auth Parity

## Purpose

Define the user-visible contract that the migrated frontend must honor for routing, guarded access, and session-related navigation behavior.

## Route Coverage Contract

1. Every in-scope route from the current frontend must have one of the following outcomes:
   - A migrated route with the same intent and reachable destination
   - An approved fallback behavior documented before release
2. Public routes must remain directly accessible without requiring authentication.
3. Protected routes must not render protected content to unauthenticated users.
4. Direct browser access to a valid migrated route must lead to either:
   - The expected content for authorized users, or
   - A clear redirect or recovery path for unauthorized users

## Auth Navigation Contract

1. When an unauthenticated user attempts to access a protected route, the frontend must redirect the user to the sign-in flow.
2. When redirecting a user to sign in, the frontend must preserve enough destination context to return the user to the intended route after successful authentication when that behavior exists today.
3. When an authenticated session becomes invalid during use, the frontend must:
   - Clear the local authenticated session state
   - Inform the user that the session is no longer valid
   - Redirect the user to a valid recovery route
4. Route-level role restrictions must continue to prevent users from reaching flows outside their permitted experience.

## Layout and Navigation Contract

1. Shared navigation shells used today for protected `/k` experiences must remain consistent enough that users can still find the same feature areas without relearning the product structure.
2. Route nesting or layout changes are acceptable only if the user-facing navigation intent remains intact.
3. Existing deep links, bookmarks, and shared URLs for in-scope routes must continue to resolve to meaningful destinations.

## Error and Recovery Contract

1. API failures encountered during navigation or page initialization must produce a visible error or recovery state rather than a blank screen.
2. Protected route checks must fail safely by redirecting or blocking content, not by leaving the application in a partially loaded protected state.
3. Any route or behavior intentionally removed from parity must be listed in the fallback behavior record before release.

## Acceptance Evidence

To satisfy this contract, the migration must provide:
- A route capability inventory
- A parity checklist for P1 and P2 flows
- Evidence of successful sign-in, protected navigation, and invalid-session handling
- Explicit approval for any fallback behavior

## Current Foundation Inventory Scaffold

- Public routes scaffolded in the Vite router: `/`, `/about`, `/contact`
- Auth routes scaffolded in the Vite router: `/login`, `/register`, `/forgot-password`, `/reset-password`
- Protected `/k` baseline scaffolded in the Vite router: `/k`, `/k/dashboard-student`, `/k/dashboard-teacher`, `/k/profile`, `/k/verify`, `/k/subscription`
- Expanded `/k` routes scaffolded in the Vite router: `/k/my-materials`, `/k/flash-card`, `/k/history`, `/k/history/exam`, `/k/history/pdf`, `/k/ai-teacher`
- Study route scaffolded in the Vite router: `/study-flashcard/:id`
- Teacher management routes scaffolded in the Vite router: `/k/manage-exam`, `/k/manage-quiz-set/:id`, `/k/manage-flashcard-set/:id`, `/k/manage-exam-room`, `/k/manage-exam-room/:id`, `/k/manage-exam-room/:id/session/:sessionId`
- AI routes scaffolded in the Vite router: `/k/ai-tool`, `/k/ai-teacher`
- Exam-session routes scaffolded in the Vite router: `/exam-session/:id`, `/exam-session/:id/quiz`
- Student exam history route scaffolded in the Vite router: `/k/my-exams`
- Legacy App Router runtime page entrypoints have been removed from migrated frontend slices; active routing now flows through the Vite router
- Redirect-back foundation currently uses `auth_return_to` localStorage persistence plus `from` query propagation for protected-route entry
- Current validation evidence includes successful `pnpm build` plus `pnpm lint` with one existing warning in `src/components/organisms/LabelManager.tsx`
