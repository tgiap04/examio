---
passed: false
failed: 2
missing: 0
warnings: 4
---

# Core Rebuild-Spec Review Report

Generated: 2026-05-27 21:04 Asia/Saigon  
Scope: Wave 0-6.9 core rebuild-spec artifacts in `plans/260527-1951-rebuild-spec/artifacts`

## Verdict

Not ready for promotion without fixes. Required files are present and non-empty, and the major ID families are mostly coherent, but entity/model references in `feature-list.md` are materially inconsistent with `data-model.md`. This can mislead downstream promotion/spec generation.

## Required File Presence

All required files exist and are non-empty:

- `scout-report.md`
- `_session-context.md`
- `system-overview.md`
- `route-list.md`
- `data-model.md`
- `screen-list.md`
- `screen-flow.md`
- `behavior-logic.md`
- `permissions.md`
- `permissions-matrix.md`
- `business-rules.md`
- `user-stories.md`
- `feature-list.md`
- `api-map.md`
- `entities.md`
- `glossary.md`
- `flows/auth-session-flow.md`
- `flows/mobile-auth-flow.md`
- `flows/payment-subscription-flow.md`
- `flows/ai-file-processing-flow.md`
- `flows/exam-attempt-flow.md`

Missing count: 0.

## Failed Issues

### 1. `feature-list.md` has incorrect `MODEL###` references

Severity: blocking

Several feature entity lines point to model numbers that represent different entities in `data-model.md`. Examples:

- `feature-list.md` F003 references `MODEL014 FlashCardSet`, but `data-model.md` defines `MODEL014` as `QuizPracticeAttempt`; `FlashCardSet` is `MODEL015`.
- `feature-list.md` F003 references `MODEL018 ExamAttempt`, but `data-model.md` defines `MODEL018` as `ExamRoom`; `ExamAttempt` is `MODEL020`.
- `feature-list.md` F004 references `MODEL021 HistoryGeneratedQuizz`, but `data-model.md` defines `MODEL021` as `CheatingLog`; `HistoryGeneratedQuizz` is `MODEL025`.
- `feature-list.md` F005 references `MODEL014 FlashCardSet`, `MODEL015 FlashCard`, and `MODEL016 DetailsFlashCard`; in `data-model.md` these should be `MODEL015`, `MODEL016`, and `MODEL017` respectively.
- `feature-list.md` F006 references `MODEL021 HistoryGeneratedQuizz`, `MODEL022 HistoryGeneratedFlashcard`, `MODEL024 UserStorage`, and `MODEL025 Document`; in `data-model.md` these should be `MODEL025`, `MODEL026`, `MODEL027`, and `MODEL028`.
- `feature-list.md` F007 references `MODEL018 AIChat`, `MODEL019 AIChatMessage`, `MODEL020 AIChatDocument`, `MODEL024 UserStorage`, and `MODEL025 Document`; in `data-model.md` these should be `MODEL022`, `MODEL023`, `MODEL024`, `MODEL027`, and `MODEL028`.
- `feature-list.md` F008/F009 reference exam models with shifted IDs; `data-model.md` defines `ExamRoom=MODEL018`, `ExamSession=MODEL019`, `ExamAttempt=MODEL020`, `CheatingLog=MODEL021`.
- `feature-list.md` F011 references `MODEL024 UserStorage` and `MODEL025 Document`; in `data-model.md` these should be `MODEL027` and `MODEL028`.

Fix: update `feature-list.md` entity references to match `data-model.md`, then re-run cross-reference checks.

### 2. `entities.md` is not linked from most core artifacts

Severity: blocking for traceability

`entities.md` defines `ENT001`-`ENT205`, but the rest of the core artifacts largely use `MODEL###` references and do not cross-link `ENT###` IDs. The requested review includes `MODEL/ENT refs`; currently the entity catalog is useful standalone, but it is not traceable enough from features, business rules, flows, or APIs.

Fix: either add `ENT###` references where domain entities are listed, or explicitly state that `MODEL###` is the canonical cross-artifact entity reference and `entities.md` is an auxiliary catalog.

## Warnings

### 1. `permissions.md` and `permissions-matrix.md` have different detail levels

`permissions.md` defines `PERM001`-`PERM040`; `permissions-matrix.md` only lists `PERM001`-`PERM018`. This may be intentional if the matrix is a grouped view, but it should be stated clearly in `permissions-matrix.md` to avoid looking incomplete.

### 2. Many sections rely on `Needs verification`

This is acceptable because uncertain items are marked, not fabricated. However, promotion should preserve the markers. High-impact verification areas include GenAI tutor access rules, admin/teacher permissions, mobile non-auth API wiring, proctoring thresholds, and exact redirect/navigation behavior.

### 3. `business-rules.md` contains a screen reference that may need source confirmation

`BR064` references `SCR107` and says Android `HomeScreen` exists but is not wired into main navigation. This is plausible from `screen-list.md`, but because it is a business rule derived from implementation wiring rather than product behavior, it should remain marked/traceable to scout evidence if promoted.

### 4. API/route granularity is mixed but usable

`route-list.md` combines gateway proxy patterns, concrete backend domain routes, frontend routes, and mobile deep links. `api-map.md` groups by API capability. This is acceptable for promotion, but downstream consumers should treat gateway proxy routes and concrete service routes differently.

## Consistency Checks

- `F###`: 12 IDs found; all feature IDs used in `feature-list.md`, `api-map.md`, and flow files are defined.
- `US###`: 20 IDs found; all user story IDs used in `feature-list.md` are defined in `user-stories.md`.
- `SCR###`: 61 IDs found; all screen IDs referenced by `screen-flow.md`, `permissions.md`, and `business-rules.md` are defined in `screen-list.md`.
- `BL###`: 48 IDs found; all business/behavior logic IDs referenced by flows and rules are defined in `behavior-logic.md`.
- `PERM###`: 40 IDs found; all permission IDs referenced by `business-rules.md` are defined in `permissions.md`.
- `MODEL###`: `data-model.md` defines 58 IDs, but `feature-list.md` has multiple incorrect ID-to-name pairings. See failed issue 1.
- `ENT###`: `entities.md` defines entity IDs, but cross-artifact use is minimal. See failed issue 2.

## Fabrication Review

No obvious unmarked fabrication found in this pass. Areas that appear inferred or uncertain are generally labeled with `Needs verification`, `exact routes need verification`, `admin needs verification`, or similar language.

## Promotion Readiness

Promotion readiness: no.

Required before promotion:

1. Correct the mismatched `MODEL###` references in `feature-list.md`.
2. Decide and document the canonical entity reference strategy for `MODEL###` vs `ENT###`.

Recommended before promotion:

1. Add a note to `permissions-matrix.md` explaining why it only lists grouped `PERM001`-`PERM018` while `permissions.md` defines `PERM001`-`PERM040`.
2. Keep all `Needs verification` markers intact in promoted docs, especially for permission, mobile, GenAI, and proctoring behavior.

## Unresolved Questions

- Should `MODEL###` or `ENT###` be the canonical cross-artifact entity reference in promoted docs?
- Is `permissions-matrix.md` intentionally a grouped summary, or should it include all `PERM001`-`PERM040` rows?

**Status:** DONE_WITH_CONCERNS
**Summary:** Reviewed all Wave 0-6.9 core artifacts and wrote this report. Files are present/non-empty, but promotion should wait until model/entity traceability issues are fixed.
**Concerns/Blockers:** Blocking inconsistency in `feature-list.md` model references; entity catalog cross-links are under-specified.
