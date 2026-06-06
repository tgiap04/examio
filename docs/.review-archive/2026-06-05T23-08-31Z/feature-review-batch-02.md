---
name: feature-review-batch-02
description: Semantic review of F006–F010 feature specs
metadata:
  type: feature-review
  batch: 02
  features: [F006, F007, F008, F009, F010]
  plan: 260605-2033-rebuild-spec
---

# Feature Spec Review — Batch 02 (F006–F010)

**Reviewer:** reviewer agent
**Date:** 2026-06-05
**Scope:** F006_QuizAuthoring, F007_FlashcardAuthoring, F008_ExamHosting, F009_AITeacherKnowledgeBase, F010_AITool

---

## Overall Assessment

All 5 specs are structurally sound and pass most deterministic checks. Two critical semantic gaps were found: an orphaned FR in F006 and a missing user story in F008 for a declared functional requirement. The remaining findings are warnings about completeness, cross-reference accuracy, and underspecified behaviors.

---

## F006_QuizAuthoring

**overall_status: WARN**

### Passed Checks
- All canonical SCR/US/PERM/MODEL codes present and cross-referenced correctly.
- DISC-013 (UserStorage.processingStatus) fully covered across 4 values with render/validation/persistence columns.
- INT-006_01 and INT-006_02 properly formed with `**Source:**` citations (though "(inferred)" qualifier noted — acceptable given "infer" is used consistently for unreferenced AI controller internals).
- Cross-cutting `### Requirements` table lists all 11 FRs with endpoints.
- SM-008_01 present in F008, not applicable here; F006 has no state machines (correctly `None.`).
- Source Code References has 11 entries — well-populated.

### Semantic Issues

**1. Orphaned FR — FR-006_01 (list quiz sets) has no dedicated user story** [warning]

FR-006_01 (`GET /api/v1/quizsets` — authenticated users list their own quiz sets) does not appear in any `**Requirements fulfilled:**` list under any user story. The US blocks cover create (US013), edit (US014), delete (US015), label management (US028), question CRUD (US029–US031), PDF history (US024–US025), and AI generation (US036, US037, US023) — but the read/list operation is absent.

**Impact:** The most common entry point for quiz authoring (the quiz set grid on MyMaterialsPage / SCR016/REG001) is not represented by a user story. Verification cannot be tied to a concrete scenario.

**Fix:** Add `FR-006_01` to the `**Requirements fulfilled:**` list of an existing US (e.g., US013 "Create Quiz Set" — the user first arrives at the grid, which implies listing) or add a minimal US "View Quiz Set Grid" with a single Given/When/Then.

**2. `### Business Rules` has narrative text, not `None.`** [warning]

The section body reads: *"None identified from source for QuizAuthoring-specific business rules..."* — this is prose, not `None.`. The validator did not flag this as critical (only flagged `dec_lazy_na` warning at line 49). Per checklist rule `FeatureSpec.ccl_blank`, an empty CCL subsection requires the literal `None.` token. A one-sentence explanation with "None" embedded in the sentence does not satisfy the mechanical requirement.

**Fix:** Replace the paragraph with:
```
### Business Rules

None.
```

**3. US023/US036/US037 scattered across F006, F007, F010** [observation]

These three cross-feature US codes (Generate Flashcards via AI, Generate Quiz via AI, Manage AI Generation Jobs) appear in the US lists of F006, F007, and F010. F010 is the dedicated AI Tool feature; F006 and F007 reference them as "participation" paths. This is architecturally correct but the `**Why this priority:**` language in the F006 copies of US036 and US037 does not acknowledge the cross-spec relationship, which could cause future readers to think F006 owns these flows.

**4. `INT-006_02` says "Job creation blocked if insufficient credits; unless FREE_MODE = true"** [minor ambiguity]

The rule is stated but the error response code is not specified (402 vs 403 vs 400). The edge-cases.md file addresses this at row 8 with "API returns 402 or 403". The INT block should be consistent: state the expected code.

---

## F007_FlashcardAuthoring

**overall_status: PASS**

### Passed Checks
- All 9 FRs (FR-007_01 to FR-007_09) covered by user stories.
- FR-007_04 (delete flashcard set) appears correctly in US018, not in US016 (contrast with F006 where FR-006_11 appeared in two places — F007 is cleaner here).
- Cross-feature US023, US036, US037 included with acknowledgment: *"FlashcardAuthoring participates in quiz generation as a destination"* — this cross-spec note is appropriate and should be in F006 and F010 too.
- `DetailsFlashCard` correctly listed in Key Entities as a separate junction table entity; FlashCardSet Key Columns include `accessCode` which matches the 6-digit code mentioned in the business context workflow.
- Edge cases table: 17 rows — comprehensive, all messages are plain language with no bare HTTP codes.

### Minor Observations

**1. `DetailsFlashCard` join table population policy is unresolved** [unresolved question]

Unresolved Question #4 in F007 correctly flags: *"Is the join table populated for all cards, or only when a label is assigned?"* This affects the behavior of label filtering on the detail page. The Key Entities table does not include a note about this ambiguity.

**2. US022 (Browse Flashcard Sets) endpoint says "returns only public sets for unauthenticated browsing"** [potential inconsistency]

The acceptance scenario states unauthenticated users can browse public sets. The API route `GET /api/v1/flashcardsets` is called out in FR-007_01 but the spec does not address whether the endpoint returns all sets to authenticated users and only public sets to unauthenticated ones. This is a BE behavior question that should be either verified or flagged as an assumption.

---

## F008_ExamHosting

**overall_status: WARN**

### Passed Checks
- Four discriminators documented correctly: DISC-001 (session status), DISC-002 (assess type), DISC-007 (question selection mode), DISC-010 (attempt status). All values, render/validation/persistence columns are present and internally consistent.
- DEC-008_01 (Start vs. Resume) and DEC-008_02 (Session Entry Access Gate) are well-formed with Mermaid-pseudocode and correct `**Source:**` citations.
- SM-008_01 and SM-008_02 present with proper `stateDiagram-v2` Mermaid blocks.
- Source Code References: 14 entries — highest count in this batch, indicating strong implementation grounding.
- `INT-008_03` (CheatingDetectionHook) correctly describes the event triggers with BL013 attribution.

### Semantic Issues

**1. FR-008_17 (log cheating violations) has no dedicated user story** [critical]

FR-008_17 (`POST /api/v1/cheatinglogs`) does not appear in any `**Requirements fulfilled:**` list. INT-008_03 describes the hook (tab switch, window blur, copy/paste, right-click, fullscreen exit, print screen), but the cheating-detection workflow has no user story in the US section. The edge cases table references "Tab switch during exam" but no user story covers "Student triggers a cheating violation" or "Host reviews the violation log."

**Impact:** FR-008_17 is a declared functional requirement with no verification path (no SC-### covers it, no US `**Requirements fulfilled:**` references it, no `**Verification:**` list links it). The integrity monitoring feature is fully described in INT/edge cases but is invisible to the user story layer.

**Fix:** Add a user story, e.g., US-CHEAT-001 "Log Cheating Violations" with Given/When/Then covering the tab-switch detection, or merge the responsibility into US059 "Resume Exam Attempt" with a note that the cheating hook runs concurrently.

**2. Cheating detection trigger list underspecified** [warning]

INT-008_03 lists 6 triggers: tab switch, window blur, copy/paste, right-click, fullscreen exit, print screen. The edge-cases.md only documents the tab-switch case. The remaining 5 triggers (window blur, copy/paste, right-click, fullscreen exit, print screen) are never mentioned in the user stories or edge cases. A reviewer reading only the user stories would not know these triggers exist.

**3. Whitelist enforcement has no dedicated user story** [warning]

DISC-002 mentions whitelist checking by userId. DEC-008_02 references whitelist as part of the access gate. But no user story covers "Student attempts to access session via whitelist" or "Host configures whitelist." The acceptance scenarios for US057 cover only the access code path, not the whitelist path. This is acceptable given the spec says "whitelist checked by userId" in DEC-008_02, but it should be acknowledged explicitly.

**4. FR-008_12 (browse exam sessions) endpoint name inconsistent** [minor]

US051's `**Requirements fulfilled:**` says "student sessions endpoint" rather than a specific route. The canonical_fcodes for F008 lists `GET /api/v1/examrooms/list` for this FR. The RouteList may not have this route defined — this should be verified and the endpoint name made explicit.

**5. US051 `**Endpoints:**` field missing** [warning — checklist rule: "US without priority → warning"]

US051 (Browse Exam Sessions) has `**Priority: P1**` in the heading but the US block does not include an `**Endpoints:**` field listing the route. Several other US blocks in F008 include endpoint details; US051 is the exception. Per checklist: *"User Story missing `**Endpoints`: METHOD /path` for its routes → warning."*

---

## F009_AITeacherKnowledgeBase

**overall_status: WARN**

### Passed Checks
- DISC-014 (UserStorage.processingStatus) fully covered across 4 values with correct render/validation/persistence columns.
- `### Requirements` table has 11 FRs, all with endpoints.
- INT-009_01, INT-009_02, INT-009_03 cover the document processing pipeline, dataset import, and knowledge graph build — correctly referencing the Python AI service.
- Edge cases table: 11 rows with consistent plain-language messages; no bare HTTP codes.
- Key Entities includes `UserStorageGraph` and `UserStorageGraphGroup` which matches the AI knowledge graph architecture described in CLAUDE.md.

### Semantic Issues

**1. Artifact References: BL codes do not match canonical_fcodes** [warning]

F009 Artifact References lists `BL005` and `BL007` (R2ClientService and OcrService). The canonical_fcodes for F009 declares `"bl": []` (no BL codes). The spec also says INT-009_01 triggers on "File upload or reprocess request" which implies R2 involvement, and the Source Code References include R2ClientService and OcrService, but these are not formally declared in the `bl:` field of the canonical spec.

**Fix:** Either update the canonical_fcodes `bl:` field to include BL005 and BL007, or remove them from Artifact References if they are incidental implementation details (not deliberate BL contracts). Currently the spec is self-inconsistent: Artifact References says these BL codes are used but the feature's canonical definition says none are.

**2. `### Decision Logic` — validator warned of conditional patterns despite N/A** [warning]

The validator raised `FeatureSpec.dec_lazy_na` at line 49: conditional JSX-ternary patterns detected in a section marked N/A. The reviewer could not confirm from spec reading alone whether there are client-side decision branches (e.g., file upload vs. reprocess button rendering) that warrant explicit DEC blocks. The N/A rationale ("no multi-predicate render or interaction-driven branching detected") is plausible but the validator's pattern detection suggests otherwise. Recommend confirming via source read of `knowledge-file.controller.ts` or `FilePanel.tsx`.

**3. Key Entities: 4 entities for a knowledge management feature — borderline low** [warning]

Four entities (UserStorage, Document, UserStorageGraph, UserStorageGraphGroup) is above the minimum of 3, but the feature manages folders (FR-009_01 to FR-009_04) with no folder entity in Key Entities. The folder concept maps to a `KnowledgeFolder` or similar model in the data model; it should appear in Key Entities with its key columns and table name.

**Fix:** Add the folder entity (e.g., `KnowledgeFolder`) to Key Entities, or clarify in an assumption that folder metadata is stored within UserStorage or a related model.

**4. Maximum file size and supported formats in edge cases use placeholder `[X] MB`** [warning]

Edge case row for "file larger than maximum allowed size" says `[X] MB` — this is a structural placeholder that should be replaced with the actual documented limit or marked as an unresolved question. The spec already has this as Unresolved Question #1 ("What is the per-file upload size limit?") so the placeholder is acknowledged, but the edge cases table should not contain unresolved placeholder values.

---

## F010_AITool

**overall_status: PASS**

### Passed Checks
- BR-010_01 (credit check) and BR-010_02 (document readiness) are properly structured blocks with `**Source:**` citations and pseudocode. This is the only spec in the batch with named BR blocks.
- DEC-010_01 (Generate Button State) covers the full render logic with 4 conditions; the Source is correctly attributed to `AIToolPage.tsx`.
- SM-010_01 (Generation Flow Status) Mermaid state diagram has 5 transitions with correct transition rule comments.
- `### Verification` section has 4 SCs (SC-010_01 to SC-010_04) all with `(covers …)` back-refs to FR or BR codes. This is the most rigorously verified spec in the batch.
- `### Assumptions` section has 5 entries — the most of any spec reviewed — indicating careful boundary-setting.
- Source Code References has 9 entries covering both backend (controller, service, finance client) and frontend (hook, page, components) layers.

### Minor Observations

**1. `### Algorithms` subsection body is blank (not `None.`)** [warning]

The `### Algorithms` H3 subsection appears at line 116 but has no body text. Per checklist rule `FeatureSpec.ccl_blank`, an empty subsection should contain the literal `None.`. The validator did not flag this (the subsections check may have matched the "None." text from an adjacent section). Confirm and add `None.` if empty.

**2. Pseudocode block 9 lines > 8-line soft limit** [warning — already flagged by validator]

DEC-010_01 pseudocode block has 9 lines. The checklist marks this as a warning (not critical). The block is readable and well-structured; no action required unless strict formatting is enforced.

**3. Unresolved Questions mapped to checklist categories**

All 5 unresolved questions in F010 are appropriately framed as unverified behavioral details (credit refund, cost model, content destination, job retention, concurrent limits). No critical semantic gaps.

---

## Summary Table

| Feature | Status | Critical | Warnings |
|---------|--------|----------|----------|
| F006_QuizAuthoring | WARN | 0 | 3 |
| F007_FlashcardAuthoring | PASS | 0 | 1 |
| F008_ExamHosting | WARN | 1 | 3 |
| F009_AITeacherKnowledgeBase | WARN | 0 | 4 |
| F010_AITool | PASS | 0 | 2 |

---

## Recommended Actions

### Must Fix (critical-path before promotion)

1. **F008**: Add a user story covering FR-008_17 (cheating violation logging). INT-008_03 and the edge cases table document this feature; the US layer does not. Without a US, the FR has no `(covers …)` SC back-ref path.

### Should Fix

2. **F006**: Add FR-006_01 to a `**Requirements fulfilled:**` list or create a minimal US "View Quiz Set Grid." The grid is the primary entry point and should not be invisible to the user story layer.
3. **F009**: Add `KnowledgeFolder` to Key Entities; verify whether the folder model is stored as a separate table or as a field on UserStorage.
4. **F009**: Resolve the BL code mismatch: canonical_fcodes says `bl: []` but Artifact References lists BL005/BL007. Align both.
5. **F006**: Replace `### Business Rules` narrative paragraph with `None.`
6. **F008**: Add `**Endpoints:**` field to US051 with explicit route name.
7. **F008**: Add whitelist access US or document the gap explicitly as an unresolved question.
8. **F010**: Confirm `### Algorithms` body is empty; add `None.` if so.

### Nice to Have

9. **F006/F008**: Acknowledge cross-spec US023/US036/US037 with a cross-ref note in the F006 and F008 copies (F007 already does this well).
10. **F009**: Replace `[X] MB` placeholder in edge-cases.md with the actual documented limit or mark as unverified.
11. **F008**: Document all 6 cheating detection triggers (tab switch, window blur, copy/paste, right-click, fullscreen exit, print screen) in the edge cases table, not just tab switch.
12. **F006**: Clarify error response code for insufficient credits in INT-006_02 (402 vs 403).

---

## Unresolved Questions (cross-spec)

1. **F006/F010**: Is credit deduction atomic with job creation, or does it happen on job completion? Affects refund policy on failure.
2. **F008**: What is the attempt auto-cancel policy for IN_PROGRESS attempts after session end time? (Already in F008 Unresolved Questions; needs source read.)
3. **F008**: Grading algorithm — all-or-nothing or partial credit? (Already in F008 Unresolved Questions.)
4. **F009**: Maximum file size for upload — where is it enforced (gateway, R2, AI service)?
5. **F007**: Is `DetailsFlashCard` join table populated for all cards or only when a label is assigned?

---

## Metrics

| Metric | F006 | F007 | F008 | F009 | F010 |
|--------|------|------|------|------|------|
| US blocks | 11 | 10 | 14 | 6 | 3 |
| FR count | 11 | 9 | 17 | 11 | 3 |
| SC count (top-level) | 10 | 3 | 4 | 3 | 4 |
| Key Entities | 7 | 5 | 4 | 4 | 4 |
| Source refs | 11 | 9 | 14 | 8 | 9 |
| BR blocks | 0 | 0 | 0 | 0 | 2 |
| INT blocks | 2 | 2 | 4 | 3 | 2 |
| DEC blocks | 0 | 0 | 2 | 0 | 1 |
| SM blocks | 0 | 0 | 2 | 0 | 1 |
| Edge case rows (spec) | 10 | 8 | 12 | 10 | 10 |
| Edge case rows (edge-cases.md) | 16 | 17 | 19 | 11 | 10 |

**Status:** DONE
