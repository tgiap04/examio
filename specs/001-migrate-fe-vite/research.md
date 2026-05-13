# Research: Migrate Frontend to Vite

## Decision 1: Use a client-routed application to replace the current App Router structure

**Decision**: Rebuild the frontend around a client-side route tree that preserves current URL intent for landing, auth, protected `/k`, exam-session, and study-flashcard flows.

**Rationale**:
- The current frontend is heavily organized around Next.js App Router pages and layouts under `examio-fe/src/app/**`.
- Most business behavior already lives in client-side components, Axios API modules, and Zustand stores rather than server-rendered page logic.
- Preserving route intent minimizes user disruption, protects bookmarks/shared links, and aligns with the spec requirement for stable routes.

**Alternatives considered**:
- Keep hybrid Next.js routing for some areas: rejected because the feature goal is to remove dependency on the current framework runtime.
- Change route structure during migration: rejected because it increases regression risk and weakens parity validation.

## Decision 2: Replace Next middleware protection with explicit frontend route guards

**Decision**: Move access protection from `examio-fe/src/middleware.ts` into explicit client-side route guards backed by existing auth state and redirect-back behavior.

**Rationale**:
- Current protection is split between Next middleware, `useAuthSync`, `useAuthStore`, and page/component redirects.
- After migration, middleware-based protection is no longer available, so equivalent behavior must be enforced in the routing layer.
- Existing auth patterns already provide most of the needed building blocks: token storage, user initialization, invalid-session handling, and role-based routing.

**Alternatives considered**:
- Remove route guards and rely only on backend 401 responses: rejected because it would degrade user experience and break current redirect expectations.
- Recreate middleware behavior through custom infrastructure first: rejected because it adds delivery complexity before validating simpler route-guard parity.

## Decision 3: Preserve the current API-wrapper and Zustand-store architecture during migration

**Decision**: Retain the current `src/apis/*` and `src/stores/*` layering as the primary integration and client-state model, adapting only the framework-dependent pieces.

**Rationale**:
- The frontend already centralizes backend access in `examio-fe/src/apis/api.ts` and feature-specific API modules.
- Core auth and feature state is already consolidated in Zustand stores such as `useAuthStore`, `useExamSessionStore`, and `useAITeacherStore`.
- Reusing this layering limits scope, reduces churn, and keeps the migration focused on application shell, routing, and framework dependencies.

**Alternatives considered**:
- Rewrite state management during migration: rejected because it creates unnecessary risk across many flows.
- Replace Axios modules with a new data layer immediately: rejected because it does not improve parity validation and expands the blast radius.

## Decision 4: Treat Next.js-specific primitives as a dedicated migration workstream

**Decision**: Inventory and replace framework-specific primitives in a dedicated workstream covering navigation, links, image handling, metadata/head management, fonts, dynamic route semantics, and layout composition.

**Rationale**:
- The current codebase is tightly coupled to Next-specific features including App Router layouts, route groups, dynamic segments, `next/navigation`, `next/link`, `next/image`, `next/font`, and page-level metadata exports.
- These dependencies cut across many pages and shared components, so they need systematic handling rather than ad hoc replacement.
- A dedicated workstream makes it easier to identify unsupported behaviors early and document approved fallback behavior.

**Alternatives considered**:
- Replace imports opportunistically file by file: rejected because it risks inconsistent behavior and missed framework hooks.
- Delay primitive replacement until after route migration: rejected because route and primitive changes are tightly linked in the current codebase.

## Current fallback and delta record

**Decision**: No approved fallback behaviors or route removals are currently recorded for the migrated frontend scope.

**Rationale**:
- The active Vite router now covers landing, auth, protected `/k`, study-flashcard, exam-session, exam-room management, and student exam-history flows.
- Final validation succeeded with `pnpm build`, while `pnpm lint` surfaced only one pre-existing warning in `src/components/organisms/LabelManager.tsx`.
- The remaining known delta is technical rather than user-visible: the Vite production bundle still emits large chunk warnings during build.

## Decision 5: Prioritize parity testing around sensitive protected and exam flows

**Decision**: Use a capability inventory and parity checklist that prioritizes protected `/k` flows, auth journeys, AI/study tools, and exam-session flows before broader cleanup or optimization.

**Rationale**:
- The highest-risk areas combine protected navigation, redirects, user initialization, timed workflows, and API-backed interactions.
- Exam-session flows and protected dashboards are likely to expose regressions quickly if routing or auth behavior shifts.
- A parity-first rollout supports the spec requirement that P1 user journeys remain fully usable before migration is considered complete.

**Alternatives considered**:
- Validate only at page level: rejected because page presence alone would miss behavioral regressions.
- Focus first on public landing pages: rejected because these are lower-risk and less critical to migration acceptance.
