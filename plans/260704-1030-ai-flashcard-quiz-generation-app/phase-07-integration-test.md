# Phase 07 — Integration, Edge Cases, Tests

## Context Links
- P04 (Android) + P06 (iOS) complete

## Overview
- **Priority:** Medium-High
- **Status:** pending
- **Description:** Prove the full loop on both platforms, cover edge cases, add tests where the stack allows.

## Requirements / Edge Cases
- File validation: non-PDF rejected, >5MB rejected, >50 pages warned (match FE client checks).
- Concurrency: BE Redis lock allows 1 quiz + 1 flashcard job/user → surface the `ConflictException` (409) as a clear message.
- Failed job (`status:failed`) → user-facing error, allow retry.
- `ai-tool` page toggle disabled (404) → entry hidden or graceful message.
- Long job vs token expiry (esp. iOS) → re-auth path.
- Save into multiple sets / create-new set / with+without label.

## Related Code Files
- Test: `shared/src/commonTest/...` for repo/DTO serialization (save-history request/response, JobStatus parsing).
- Manual QA matrix: Android + iOS × {quiz, flashcard} × {new set, existing set}.

## Implementation Steps
1. Shared unit tests: JobStatus parsing (P01 fix), save-history request serialization, `ApiResult` error mapping.
2. Android instrumented/manual run of the full loop; verify set appears in study/quiz screens.
3. iOS manual run of the full loop.
4. Walk the edge-case list on both platforms.
5. Hand to `reviewer`; run `run-tests` for the shared module.

## Todo List
- [ ] Shared unit tests (serialization + status parsing)
- [ ] Android full-loop QA (quiz + flashcard)
- [ ] iOS full-loop QA (quiz + flashcard)
- [ ] Edge cases (size/type/pages/409/failed/toggle/token)
- [ ] Reviewer pass

## Success Criteria
Both platforms complete the generate→save→view loop; edge cases handled; shared tests green; reviewer approves.

## Next Steps
Deliver per takumi Stage 6 (docs/parity/commit on user approval).
