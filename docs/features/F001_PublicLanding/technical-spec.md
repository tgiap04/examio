# F001_PublicLanding

**Priority**: P1
**Type**: ui
**Generated**: 2026-06-05

## Overview

Public landing experience for unauthenticated and authenticated users. The home page serves as the entry point for all platform visitors, displaying featured quiz sets, flashcard sets, and exam rooms. Static informational pages (About, Contact, Legal) provide transparency about the platform. Contact form submission is the only write operation targeting unauthenticated users.

## Polymorphic Behavior

N/A — no discriminator fields in Key Entities (QuizSet, FlashCardSet, ExamRoom have no DISC-### fields).

## Cross-Cutting Logic

### Requirements

| Code | Description | Endpoint/Handler | Verifiable |
|------|-------------|-----------------|------------|
| FR-001 | Browse platform content | GET / (public) | yes |
| FR-002 | Submit contact form | POST /api/v1/contact | yes |

### Business Rules


None.
### Decision Logic


None.
### State Machines


None.
### Algorithms


None.
### External Integrations


None.
### Verification

- **SC-001** — Landing page content is visible to unauthenticated users without any session token (covers FR-001)
- **SC-002** — Contact form submission returns success response and persists the message (covers FR-002)

---

**Client behavior:** see
[`behavior-logic.md`](../../docs/system/behavior-logic.md) (client-side patterns — debounce, optimistic UI, polling, upload, realtime),
[`permissions.md`](../../docs/system/permissions.md) (feature flags / experiments / env / locale gates),
[`architecture.md`](../../docs/system/architecture.md) (guards / deep-link state restoration / unsaved-changes protection).

## User Stories

### US001 — Browse Platform Content (Priority: high)

**What happens:** A guest lands on the home page and sees featured public quiz sets, flashcard sets, and exam rooms. They can click Login or Register CTAs to proceed to authentication.

**Why this priority:** Discovery is the primary acquisition funnel — unauthenticated users must be able to evaluate platform value before registering.

**Independent Test:** Load `/` without a session token. Verify hero section, content grid, and navigation CTAs are rendered. Click Login CTA → navigate to `/login`.

**Acceptance Scenarios:**

1. **Given** the user is unauthenticated, **When** they visit `/`, **Then** they see the home page with featured content and CTA buttons.
2. **Given** the user is authenticated, **When** they visit `/`, **Then** they see the same content (auth state does not affect public content).

**Requirements fulfilled:**

- **FR-001** Browse public content — `GET /` (public route, no auth required)
  **Source:** not yet read

### US002 — Submit Contact Form (Priority: low)

**What happens:** A guest fills in the contact form (name, email, message) and submits it. The platform records the message and returns a success confirmation.

**Why this priority:** Low-touch communication channel; does not block any core flow.

**Independent Test:** Fill and submit the contact form on `/contact`. Verify success message appears. Verify no session is required.

**Acceptance Scenarios:**

1. **Given** the user fills all required fields, **When** they submit the form, **Then** a success confirmation is shown.
2. **Given** the user leaves a required field empty, **When** they submit, **Then** inline validation errors appear.
3. **Given** the user is unauthenticated, **When** they submit the contact form, **Then** the submission succeeds (no session required).

**Requirements fulfilled:**

- **FR-002** Submit contact message — `POST /api/v1/contact`
  **Source:** not yet read

**Rules enforced:**

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Contact form submitted with empty required field | HTTP 400 with validation error message |
| Contact form submitted by authenticated user | HTTP 200, message persisted normally |
| Static page route accessed with malformed URL | HTTP 404 rendered as friendly page |

## Key Entities

| Entity | Table | Key Columns | Purpose |
|--------|-------|-------------|---------|
| QuizSet | `QuizSet` | id, title, isPublic, thumbnail | Read-only listing on home page |
| FlashCardSet | `FlashCardSet` | id, title, isPublic, thumbnail | Read-only listing on home page |
| ExamRoom | `ExamRoom` | id, title, quizSetId, hostId | Read-only listing on home page |

## Artifact References

| Artifact | File | Codes Used | Reviewed |
|----------|------|------------|----------|
| System Overview | [system-overview.md](../../docs/system/system-overview.md) | — | [x] |
| Architecture | [architecture.md](../../docs/system/architecture.md) | — | [x] |
| Feature List | [feature-list.md](../../docs/generated/feature-list.md) | F001 | [x] |
| API Map | [api-map.md](../../docs/generated/api-map.md) | — | [ ] |
| Entities | [entities.md](../../docs/generated/entities.md) | — | [ ] |
| Screens | [screens.md](../../docs/features/F001_PublicLanding/screens.md) | SCR001–SCR007 | [ ] |
| Behavior Logic | [behavior-logic.md](../../docs/system/behavior-logic.md) | — | [ ] |
| Permissions | [permissions.md](../../docs/system/permissions.md) | PERM001 | [x] |
| User Stories | [user-stories.md](../../docs/generated/user-stories.md) | US001, US002 | [x] |

## Assumptions

- All public content is visible to any visitor regardless of session state.
- Contact form does not require rate limiting for initial implementation.
- Static pages (About, Terms, Privacy, Cookies, Security) render server-side or static content only.

## Source Code References

| Symbol | Path | Purpose |
|--------|------|---------|
| HomePage | `kmaedu-fe/src/pages/HomePage.tsx` | Public landing page |
| ContactForm | `kmaedu-fe/src/pages/ContactPage.tsx` | Contact form submission |
| Static pages | `kmaedu-fe/src/pages/{About,Terms,Privacy,Cookies,Security}Page.tsx` | Informational pages |

> Note: Source code paths not yet verified via Read tool. Pending source-code audit phase.

## Unresolved Questions

1. **{HomePage}**: Whether content is server-side rendered or fetched client-side on mount — not confirmed from source.
2. **{ContactForm}**: Whether rate limiting or spam protection (other than the gateway rate limit) is applied — not confirmed.
