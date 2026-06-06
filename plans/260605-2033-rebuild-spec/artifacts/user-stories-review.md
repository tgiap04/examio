---
passed: true
issues: 0
warnings: 3
---

## Code Review Summary

### Scope
- Files: `plans/260605-2033-rebuild-spec/artifacts/user-stories.md`
- LOC: 2062
- Focus: Quality gate W5 — user story structural quality

### Overall Assessment
62 user stories (US001–US062) covering all 32 frontend screens. All stories are `ui`-typed, all have named human actors, all have outcomes, codes are unique. Three stories use "manage" as a non-specific verb indicating scope too broad for clean W5 grouping.

---

### Critical Issues
None.

---

### Warnings

**W1 — US028 "Manage Quiz Set Labels" (SCR022)**
- `manage` is the only verb; the AC confirms it covers add + edit + delete, which are 3 distinct CRUD actions
- Heuristic: "manage" without a specific action verb covers too broad a scope
- Suggestion: Split into US028a Add Label, US028b Edit Label, US028c Delete Label — or rename to "Add Quiz Set Label" (primary action) and delegate edit/delete to separate stories with different interaction types
- Impact: W5 grouping will group by interaction type; this story would need to be duplicated across `primary-action`, `secondary-action`, and `destructive-action` groupings

**W2 — US032 "Manage Flashcard Set Labels" (SCR023)**
- Same issue as W1: `manage` covers add + edit + delete labels as one story
- Same recommendation: split by action type or scope to a single specific action

**W3 — US038 "Manage Knowledge Folders" (SCR025/REG001)**
- Same issue: `manage` covers create + rename + delete folders as one story
- AC confirms all three: "allows creating a new folder", "Existing folders can be renamed", "Folders can be deleted"
- Same recommendation applies

---

### Passed Checks

- Check 1 (Single intent per story): No US### contains two or more distinct user verbs in the goal. Stories with multiple targets (e.g., US014 edits metadata + labels + questions) are a single edit action applied to multiple components — not distinct intents. US055 "study flashcards by flipping, navigating, and tracking progress" has one verb ("study") with multiple sub-behaviors, not distinct intents.
- Check 2 (Actor clarity): Every US### has a named human actor. All 62 use `guest`, `student`, or `teacher`. No "system" or "application" actors.
- Check 3 (Outcome present): Every US### has a `so that...` clause. All outcomes are user-visible.
- Check 4 (Overly broad scope): Only the 3 warnings above. All other US### goals have specific action verbs.
- Check 5 (US### code uniqueness): All codes US001–US062 are unique. No duplicates.

---

### Positive Observations

- All stories follow the `US###_NameSlug` format correctly
- Interaction inventory is comprehensive and maps every interactive element to a US
- IPE_ZERO screens (static pages) are properly flagged
- Screen → US map is complete and cross-referenced
- Cross-reference validation section is thorough
- Actor distribution (guest/student/teacher) is consistent with permission matrix
- No `any` types, no secrets, no SQL — document only

---

### Recommended Actions

1. **[Medium]** Split US028, US032, US038 into per-action stories before W5 proceeds. This avoids duplication in interaction-type groupings and makes AC ownership unambiguous.
2. **[Low]** Consider renaming US028/US032/US038 titles to reflect the primary action (e.g., "Add Quiz Set Label") and treat edit/delete as separate secondary/destructive stories. Not blocking — the AC already clarify the scope.

---

### Metrics
- US Count: 62
- Unique codes: 62
- Named actors: 62/62
- Outcomes present: 62/62
- Stories with specific action verb: 59/62
- Stories flagged broad scope: 3/62

### Unresolved Questions

- US028/US032/US038: Should these be split now, or accepted as-is and handled during W5 grouping? The warnings above do not block W5 — the document passes all critical checks.
