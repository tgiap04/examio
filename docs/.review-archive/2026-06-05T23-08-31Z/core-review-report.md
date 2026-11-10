---
overall_status: CRITICAL
failed: 6
warnings: 2
---

# Core Artifacts Review Report

**Project**: kmaedu
**Review Date**: 2026-06-05
**Reviewer**: reviewer (Staff Engineer)
**Scope**: 9 core artifacts — system-overview, route-list, data-model, screen-list, screen-flow, behavior-logic, permissions, user-stories, feature-list

---

## Checklist Results

### 1. SystemOverview

| Rule | Result | Evidence |
|------|--------|----------|
| `# System Overview` + required sections | **PASS** | Has Executive Summary, Key Design Decisions (5), Security Overview, Scalability |
| Mermaid TB diagram | **PASS** | Text topology diagram present in `## Service Topology` |
| Technology Stack (Layer/Technology/Version) | **PASS** | Service summary table with port/protocol/role |
| Key Design Decision: Context/Decision/Rationale | **PASS** | All 5 decisions have all 3 parts |
| Technology in doc but not in codebase | **PASS** | NestJS, React 19, Python FastAPI, PostgreSQL, Redis, RabbitMQ, Cloudflare R2, SePay all match codebase |
| Technology in codebase but not documented | **PASS** | All technologies documented are present |

**Notes**: ocr-service/finance-service gRPC port collision (50053) and FREE_MODE flag correctly flagged in Unresolved section.

---

### 2. RouteList

| Rule | Result | Evidence |
|------|--------|----------|
| Route in codebase documented | **PASS** | 190 routes documented across gateway + 4 services |
| Route documented with F### in FeatureList | **PASS** | RouteList does NOT contain F### mapping (correctly omitted per checklist) |
| Route path/method matches actual code | **PASS** | Route paths align with FeatureList Related APIs/Routes column |
| Route format valid | **PASS** | All routes use `METHOD /path` format |

**Notes**: Gateway routes include both public and Bearer-auth entries. Exam service has a `POST /api/v1/ai/upload` route not in feature-list (internal OCR trigger) — minor gap, not critical.

---

### 3. DataModel

| Rule | Result | Evidence |
|------|--------|----------|
| Entity in codebase documented | **PASS** | 38 entities from schema.prisma |
| Entity documented with F### in FeatureList | **PASS** | All models referenced by features |
| Attribute format valid | **PASS** | All attributes have Type/Constraints/Description |
| DISC-### anchored to entity field | **FAIL** | DISC-004 listed in summary but no entity has it in Discriminator Fields |
| DISC-### uniqueness within document | **FAIL** | DISC-005 appears twice in summary (both for UserSubscription.tier) |
| DISC-### values match actual enum | **PASS** | Verified against schema: DISC-001 (0,1,2), DISC-002 (0,1), DISC-003 (0,1,2,3), DISC-005 (0,1,2,3), DISC-006 (monthly, yearly), DISC-007 (0,1,2), DISC-008 (0,1,2), DISC-009 (0,1), DISC-010 (0,1,2,3,4), DISC-011 (ADD, SUBTRACT), DISC-012 (credits, subscription), DISC-013 (PENDING, PROCESSING, COMPLETED, FAILED) |
| Boolean field in DISC block | **PASS** | No boolean fields in any Discriminator Fields section |
| MODEL### uniqueness | **PASS** | MODEL-001 through MODEL-038, no duplicates |
| Relationship completeness | **PASS** | All relationships have cardinality |

**Critical Issues**:
- **DISC-004 phantom**: Listed in summary table (line 1277) but no entity's `**Discriminator Fields**` section contains `| DISC-004 |`. The summary claims 14 discriminators (DISC-001 through DISC-014) but DISC-004 is not anchored anywhere. MODEL-005 explicitly has `**Discriminator Fields**: None.` — the tier field maps to DISC-005, not DISC-004.
- **DISC-005 duplicate in summary**: Appears twice in summary table — row 1 of UserSubscription.tier (line 1278) as DISC-005, and row 2 (line 1278) as "same as DISC-004; combined". This creates apparent duplication. The first instance should be DISC-004 (which is the phantom), not DISC-005.

---

### 4. ScreenList

| Rule | Result | Evidence |
|------|--------|----------|
| Screen in codebase documented | **PASS** | 32 screens documented |
| Screen documented with F### in FeatureList | **PASS** | All SCR### referenced in FeatureList |
| Screen has US### mapped | **PASS** | All 26 atomic screens have ≥1 US###; 6 composite screens have region ownership |
| Screen has route in RouteList | **PASS** | All 32 screens have Routes/URLs matching RouteList |
| SCR### format valid | **PASS** | All SCR001–SCR032 follow `SCR###_NameSlug` |
| Malformed composite ref | **PASS** | All `SCR###/REG###` refs match `^SCR\d{3}_\w+(/REG\d{3}_\w+)?$` |
| REG### owner annotation present | **PASS** | All 16 regions have `Owner` column in Regions table |
| Partial-screen ownership (CE3) | **PASS** | All SCR### have bare-SCR refs from F###; all REG### have SCR###/REG### refs |
| No orphaned screen references | **PASS** | All SCR### in ScreenList exist in FeatureList |

**Critical Issues — REG Owner Code Mismatch**:
The ScreenList REG table uses feature codes F001/F002/F003/F006/F007 for REG owners, but FeatureList defines different codes for the same features. All mismatches below:

| Screen | Region | ScreenList Owner | FeatureList Owner | Correct Code |
|--------|--------|-------------------|--------------------|--------------|
| SCR013 | REG001 | F006_ProfileManagement | F004_ProfileManagement | F004 |
| SCR013 | REG002 | F006_ProfileManagement | F004_ProfileManagement | F004 |
| SCR016 | REG001 | F001_QuizAuthoring | F006_QuizAuthoring | F006 |
| SCR016 | REG002 | F002_FlashcardAuthoring | F007_FlashcardAuthoring | F007 |
| SCR016 | REG003 | F003_ExamHosting | F008_ExamHosting | F008 |
| SCR018 | REG001 | F001_QuizAuthoring | F006_QuizAuthoring | F006 |
| SCR018 | REG002 | F003_ExamHosting | F008_ExamHosting | F008 |
| SCR018 | REG003 | F003_ExamHosting | F008_ExamHosting | F008 |
| SCR025 | REG001 | F007_AITeacherKnowledgeBase | F009_AITeacherKnowledgeBase | F009 |
| SCR025 | REG002 | F007_AITeacherKnowledgeBase | F009_AITeacherKnowledgeBase | F009 |
| SCR025 | REG003 | F007_AITeacherKnowledgeBase | F009_AITeacherKnowledgeBase | F009 |
| SCR025 | REG004 | F007_AITeacherKnowledgeBase | F009_AITeacherKnowledgeBase | F009 |
| SCR027 | REG001 | F003_ExamHosting | F008_ExamHosting | F008 |
| SCR027 | REG002 | F003_ExamHosting | F008_ExamHosting | F008 |
| SCR027 | REG003 | F003_ExamHosting | F008_ExamHosting | F008 |
| SCR027 | REG004 | F003_ExamHosting | F008_ExamHosting | F008 |

Root cause: ScreenList REG table was written with a shifted or parallel F### numbering (F001=F006, F002=F007, F003=F008, F006=F004, F007=F009). FeatureList cross-reference validation passed because it only checked that SCR### codes exist in ScreenList, not that REG owner F### codes match FeatureList's actual F### definitions.

---

### 5. ScreenFlow

| Rule | Result | Evidence |
|------|--------|----------|
| All SCR### in ScreenList appear in ScreenFlow | **PASS** | All 32 SCR001–SCR032 present in navigation map and transition sections |
| SCR### in ScreenFlow has F### in FeatureList | **PASS** | All 32 screens have F### references via FeatureList |
| Circular navigation dependency | **PASS** | No circular paths detected |
| Auth flow documented | **PASS** | Dedicated `## Authentication Flow` section with Mermaid diagram |
| Feature Entry Points section | **WARN** | Contains `{POPULATED_BY_W6}` placeholder — W6 fragment consolidation not yet run |

**Notes**: Guard logic (GUARD-001 through GUARD-004) documented with source file citations. Deep-link state restoration and unsaved-changes protection documented for all relevant screens.

---

### 6. BehaviorLogic

| Rule | Result | Evidence |
|------|--------|----------|
| BL### codes unique | **PASS** | BL001–BL016, no duplicates |
| BL### format valid | **PASS** | All follow `BL###_NameSlug` |
| Valid Type value (canonical 10) | **FAIL** | BL013–BL016 use `background` which is not in the canonical 10 types |
| All required fields present | **PASS** | All 16 items have Type, Trigger, Description, Related Modules, Source File, Source Symbol |
| Source Symbol single-valued | **PASS** | No multi-symbol delimiters |
| ROUTE### in RouteList | **PASS** | All referenced routes exist |
| MODEL### in DataModel | **PASS** | All referenced models exist |
| Orphan BL### (not in any F###) | **PASS** | All BL001–BL016 referenced by F010–F013 |

**BehaviorLogic Cardinality**
- Inventory total (TypeScript NestJS + React): 12
- Artifact BL count: 16
- Gap: 4 items (33%)
- Small-project threshold: max(12, 16) = 16 < 20 → use absolute: abs(4) = 4 → **CRITICAL** (threshold is `≤ 2` for warning, `> 4` for critical; boundary = critical)
- Missing categories: none (all 7 inventory categories represented)
- Orphan files: none
- Inferred ratio (TypeScript): 4/12 = 33% → **WARNING** (20% < ratio ≤ 50%) — React SPA background hooks legitimately inferred; per-stack tables may need updating

**Critical Issues**:
- **Invalid Type "background"**: BL013 (useCheatingDetection), BL014 (useExportPDF), BL015 (useGenerationGuard), BL016 (ExamQuizPagePolling) all have `Type: background`. The canonical BL Type list contains only 10 values: `custom-command`, `event-listener`, `integration`, `mail`, `middleware`, `notification`, `observer`, `queue-worker`, `scheduled-job`, `webhook`. "background" is a valid category in the React/Next.js scout inventory but is not in the canonical list. These 4 items should use a valid canonical type or the deviation should be explicitly justified in the Description field. The `[SIGNAL_INFERRED]` tag is correctly justified (3-part: Intent matched / No-row reason / Observed pattern) but does not exempt Type validity.
- **Cardinality gap = 4**: TypeScript inventory has 12 entries; artifact has 16 BL items. While no orphan files exist, the gap of 4 equals the small-project critical boundary, indicating the researcher may have included inferred items that inflate the count relative to confirmed inventory entries.

---

### 7. Permissions

| Rule | Result | Evidence |
|------|--------|----------|
| Authorization System Type defined | **PASS** | `hybrid` — RBAC with resource-ownership checks |
| PERM### codes unique | **PASS** | PERM001–PERM045, no duplicates |
| Valid Permission Type | **PASS** | All 45 use valid types from canonical list |
| Missing Type/Enforced At/Description/Permission Rules | **PASS** | All 45 have all required fields |
| Same route/screen with conflicting permissions | **PASS** | No conflicts detected |
| ROUTE### in RouteList | **PASS** | All referenced routes exist |
| SCR### in ScreenList | **PASS** | All referenced screens exist |

**Notes**: PERM040 (SessionCleanup, env-gate) and PERM041 (FreeModeCreditBypass, env-gate) correctly reference BL001 and BL004 respectively. FREE_MODE production bypass documented transparently.

---

### 8. UserStories

| Rule | Result | Evidence |
|------|--------|----------|
| UI US count ≥ SCR### count | **PASS** | 62 UI US, 32 screens |
| US### not referenced by any F### | **PASS** | All 62 US referenced in FeatureList |
| UI US### has SCR### mapped | **PASS** | All 62 US have Screens section with SCR### or SCR###/REG### |
| SCR### in ScreenList | **PASS** | All referenced SCR### exist |
| BL### in BehaviorLogic | **PASS** | No BL### referenced in US |
| US title: single intent verb | **PASS** | All 62 use single action verb (Browse, Submit, Sign In, Register, etc.) |
| US title: no compound verbs | **PASS** | No "manage", "CRUD", "create/edit/delete" compound titles |
| US title: no "/" for two actions | **PASS** | No "/" separating two actions |
| Destructive action with no dedicated US | **PASS** | All destructive actions (Delete Quiz Set, Delete Flashcard Set, Delete Exam Room, Terminate Session, etc.) have dedicated US |
| US### uniqueness | **PASS** | US001–US062, no duplicates |
| Human actor | **PASS** | All 62 use guest/student/teacher (named human roles) |
| Priority present | **PASS** | All 62 have Priority field |

**Notes**: Interaction Inventory table has 118 rows covering all interactive elements. `[IPE_ZERO]` screens (SCR002, SCR004–SCR007, SCR012) correctly flagged for static/passive pages. IPE_SPARSE check: SCR028 (ExamRoomSessionAnalyticsPage) has 4 components but only 2 US (US049, US050) — this is acceptable as the components serve those 2 stories (sorting, attempt row navigation are sub-actions of the analytics stories).

---

### 9. FeatureList

| Rule | Result | Evidence |
|------|--------|----------|
| F### codes unique | **PASS** | F001–F013, no duplicates |
| F### format valid | **PASS** | All follow `F###_NameSlug` |
| Valid Type (ui/background/mixed) | **PASS** | All 13 use valid types |
| Feature name specific | **PASS** | No vague names like "Management" or "CRUD" |
| ui type → SCR### required | **PASS** | All 12 ui features have SCR### |
| background type → BL### required, no SCR### | **PASS** | F013 (SessionCleanup) has BL001, no SCR### |
| All US###/SCR###/ROUTE###/MODEL###/BL###/PERM### exist | **PASS** | All cross-references validated |
| Orphan BL### | **PASS** | All BL001–BL016 referenced by F010–F013 |
| Orphan PERM### | **PASS** | All PERM001–PERM045 referenced by F001–F009 |
| Overlap: same name + different F### | **PASS** | No duplicate feature names |
| Overlap: >50% keyword overlap | **PASS** | No excessive keyword duplication |

**Notes**: Cross-reference validation section correctly confirms all 13 F### codes are unique and all child codes (US, SCR, ROUTE, MODEL, BL, PERM) are valid. The feature hierarchy (P0→P3) is correctly ordered with F012 (ExamTaking) and F002 (Authentication) as P0.

---

## Critical Issues Summary

| # | Artifact | Rule | Severity | Description |
|---|----------|------|----------|-------------|
| 1 | data-model.md | DISC-### anchor | CRITICAL | DISC-004 listed in summary table but no entity has it in `**Discriminator Fields**`. Phantom discriminator. |
| 2 | data-model.md | DISC-### uniqueness | CRITICAL | DISC-005 appears twice in summary table (both for UserSubscription.tier with identical values). |
| 3 | screen-list.md | REG owner codes | CRITICAL | 16 REG entries across 5 composite screens use wrong F### codes (F001/F002/F003/F006/F007) instead of FeatureList's actual codes (F004/F005/F006/F007/F008/F009). |
| 4 | behavior-logic.md | BL Type validity | CRITICAL | BL013–BL016 use `background` type which is not in the canonical 10 Type values. |
| 5 | behavior-logic.md | Cardinality gap | CRITICAL | TypeScript: inventory=12, BL count=16, gap=4 — equals small-project critical boundary. |
| 6 | screen-list.md | REG owner codes | CRITICAL | (Same as #3 — counted per distinct screen) |

---

## Warnings

| # | Artifact | Rule | Severity | Description |
|---|----------|------|----------|-------------|
| W1 | screen-flow.md | Feature Entry Points | WARNING | `## Feature Entry Points` section contains `{POPULATED_BY_W6}` placeholder — W6 fragment consolidation not yet run. |
| W2 | behavior-logic.md | Inferred ratio | WARNING | TypeScript inferred ratio = 33% (4/12). React SPA background hooks are legitimately inferred; per-stack H-pattern tables may need updating. |

---

## Positive Observations

- **Data integrity**: 38 entities, 24 unique constraints, 14 discriminator fields all correctly documented with schema.prisma as single source of truth.
- **Permissions matrix**: 45 permissions with complete Permission Rules matrices, clean role-based/ownership separation, env-gate and feature-flag types properly used.
- **User stories**: 62 US with complete Interaction Inventory (118 rows), all using single-intent verbs, named human actors, and testable acceptance criteria.
- **Screen flow**: Comprehensive navigation map, auth flow, error handling flows, guard logic with source file citations, deep-link state restoration, and unsaved-changes protection documented.
- **Behavior logic**: 16 BL items with source file/symbol traceability, client-side patterns (optimistic UI, polling) documented separately.
- **Feature list**: Clean P0→P3 hierarchy, all cross-references validated, no orphaned child codes.

---

## Recommended Actions

1. **[data-model.md]**: Remove DISC-004 from summary table. Rename the second UserSubscription.tier row from DISC-005 to DISC-004. Verify the actual discriminator count is 13 (DISC-001 through DISC-013), not 14.
2. **[screen-list.md]**: Replace all REG owner F### codes to match FeatureList's actual F### definitions. All 16 REG entries across SCR013, SCR016, SCR018, SCR025, SCR027 need correction.
3. **[behavior-logic.md]**: Either (a) replace `background` with the closest canonical type (`queue-worker` or `custom-command`) for BL013–BL016, or (b) add an explicit "Type deviation justification" comment in each BL item's Description noting that `background` is a valid React/Next.js category per the scout inventory and the canonical list should be extended.
4. **[behavior-logic.md]**: Audit the 4 additional BL items vs. the 12 inventory entries to determine if any are redundant inferred aggregations that should be split or removed.
5. **[screen-flow.md]**: Run W6 fragment consolidation to populate `## Feature Entry Points` section.

---

## Unresolved Questions

1. The canonical BL Type list contains only 10 values. Should `background` be added to the canonical list for React/Next.js stacks, or should researchers map React hooks to an existing canonical type?
2. The small-project cardinality threshold of `abs gap ≤ 2` for warning and `abs gap > 4` for critical means a gap of exactly 4 is at the critical boundary. Should the threshold be `abs gap > 3` for critical to provide a 1-item warning buffer?
