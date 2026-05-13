# Implementation Plan: Migrate Frontend to Vite

**Branch**: `001-migrate-fe-vite` | **Date**: 2026-04-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-migrate-fe-vite/spec.md`

**Note**: This plan covers Phase 0 research and Phase 1 design artifacts for migrating the existing `examio-fe` frontend from its current Next.js App Router implementation to a React application built and served with Vite.

## Summary

Migrate the current `examio-fe` frontend to a Vite-based React application while preserving business-critical user journeys, route intent, authentication and protected navigation behavior, API-backed flows, and the current product language/content. The plan is to rebuild the application shell around client-side routing, keep the existing API-wrapper and Zustand-store pattern where feasible, replace Next.js-specific runtime features with explicit frontend equivalents, and validate parity through a capability inventory covering routes, layouts, auth flows, learning flows, AI features, and exam-session experiences.

## Technical Context

**Language/Version**: TypeScript 5.x with React 19  
**Primary Dependencies**: React 19, React DOM 19, Axios, Zustand, Tailwind CSS 4, Radix UI primitives, TipTap, Framer Motion, Recharts, react-google-recaptcha-v3  
**Storage**: Browser localStorage, browser cookies for auth sync, backend APIs as system of record  
**Testing**: Frontend linting via ESLint; migration acceptance validated through documented parity checks and manual end-to-end flow verification  
**Target Platform**: Modern desktop and mobile web browsers used by Examio learners and staff  
**Project Type**: Single frontend web application  
**Performance Goals**: Preserve current user-perceived responsiveness for sign-in, protected navigation, dashboard access, study flows, and exam-session flows after migration  
**Constraints**: Must keep existing backend integrations intact; must preserve Vietnamese user-facing copy unless explicitly changed; must replace Next.js-only capabilities such as middleware, App Router layouts, metadata exports, and framework navigation primitives; should keep diff scoped to frontend migration rather than backend redesign  
**Scale/Scope**: Existing frontend contains 30+ page entrypoints across landing, auth, protected `/k`, exam-session, and study-flashcard flows, plus 20+ API modules and 9 Zustand stores

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- `.specify/memory/constitution.md` is still a placeholder template and does not define enforceable project principles.
- No active constitutional gates were available to evaluate.
- Gate status before Phase 0: PASS
- Gate status after Phase 1: PASS

## Project Structure

### Documentation (this feature)

```text
specs/001-migrate-fe-vite/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── frontend-routing-auth-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
examio-fe/
├── src/
│   ├── app/                     # Current Next.js App Router pages, layouts, route groups
│   ├── apis/                    # Axios-based backend integration layer
│   ├── components/              # Reusable UI components
│   ├── hooks/                   # Auth sync and feature hooks
│   ├── lib/                     # Shared utilities
│   ├── provider/                # App-wide providers
│   ├── stores/                  # Zustand stores
│   ├── types/                   # Shared TypeScript domain types
│   └── middleware.ts            # Current Next.js route protection
├── package.json
├── tsconfig.json
└── eslint.config.mjs
```

**Structure Decision**: Keep `examio-fe/` as a single frontend application. Replace the current `src/app` App Router structure with a client-routed React application while preserving the existing domain layering in `src/apis`, `src/stores`, `src/components`, `src/hooks`, `src/lib`, and `src/types` wherever practical.

## Phase 0: Research Summary

Phase 0 resolves the main migration unknowns: route migration shape, auth/session enforcement without Next middleware, treatment of Next-specific primitives, and rollout risks for high-sensitivity flows.

See [research.md](./research.md) for decisions and alternatives.

## Phase 1: Design Summary

Phase 1 defines the migration design around four major workstreams:

1. **Application Shell and Routing**
   - Replace App Router route groups and nested layouts with explicit client-side route trees.
   - Preserve current URL intent for landing, auth, protected `/k`, exam-session, and study-flashcard flows.
   - Introduce route-level guards for authenticated and role-sensitive paths.

2. **Authentication and Session Behavior**
   - Remove dependency on Next middleware by moving protection fully into frontend route guards plus the existing API/session handling pattern.
   - Preserve token persistence, cookie sync expectations where still needed, invalid-session handling, and redirect-back behavior.

3. **Next.js Dependency Removal**
   - Replace `next/navigation`, `next/link`, `next/image`, metadata exports, and font/runtime-specific behaviors with framework-agnostic equivalents.
   - Rework any dynamic route or page initialization logic that currently depends on App Router semantics.

4. **Parity Validation and Release Readiness**
   - Define a capability inventory for in-scope routes and flows.
   - Validate parity for auth, dashboards, AI features, study flows, history flows, materials, subscription/profile, and exam-session journeys.
   - Track approved fallback behavior where exact legacy parity is not practical.

Design artifacts:
- [data-model.md](./data-model.md)
- [quickstart.md](./quickstart.md)
- [contracts/frontend-routing-auth-contract.md](./contracts/frontend-routing-auth-contract.md)

## Complexity Tracking

No constitution violations or exceptional complexity justifications are currently required.
