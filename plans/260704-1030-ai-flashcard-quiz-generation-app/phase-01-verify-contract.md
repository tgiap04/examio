# Phase 01 — Verify Client Contract vs Current Gateway

## Context Links
- `consultation-summary.md` · backend map (gateway `ai-study-proxy.controller.ts`, exam `modules/ai`)

## Overview
- **Priority:** Blocking (gates all wiring)
- **Status:** pending
- **Description:** The orphaned `features/ai` client has sat unused. Verify every field/enum/path against the live gateway contract before trusting it. Fix drift here so downstream phases build on solid ground.

## Key Insights
- Client `JobStatus` enum = `PENDING/RUNNING/DONE/FAILED/CANCELLED`; **BE emits** `pending/processing/completed/failed`. Almost certainly mismatched → poller never resolves.
- Gateway normalizes `quantityQuiz`→`quantityQuizz`; client sends multipart field names — confirm exact keys.
- `result` shape on completion: `{ type: "quiz"|"flashcard", quizzes|flashcards, historyId, fileInfo }`.

## Requirements
- Confirm request field names, enum values, response shapes for: `generate-from-file`, `regenerate/{id}`, `job/{id}`, `recent-uploads`, `upload/{id}`.
- Confirm save-history endpoints exist and their request/response DTOs.

## Related Code Files
- Read: `shared/.../features/ai/api/AIGeneratorApiService.kt`, `models/AIGeneratorModels.kt`, `util/AiJobPoller.kt`
- Read (BE truth): `kmaedu-be/apps/gateway-service/src/controllers/ai-study-proxy.controller.ts`, `kmaedu-be/apps/exam-service/src/modules/ai/{ai.controller.ts,ai.service.ts,dto/ai.dto.ts}`
- Read (iOS): `iosApp/KMAEduApp/Features/AI/AIToolViewModel.swift`

## Implementation Steps
1. Diff each client DTO field against BE DTO/response. Produce a drift table.
2. Fix `JobStatus` enum mapping (map BE `processing`→RUNNING, `completed`→DONE, etc.) in `AIGeneratorModels.kt` + Swift equivalent, OR align to BE string values directly.
3. Correct any mismatched multipart field keys / query params.
4. Confirm `save-history-to-{quiz,flashcard}set` DTOs; note whether app API services already expose them (feeds P02).

## Todo List
- [ ] Drift table (client vs gateway) for all `ai/*` endpoints
- [ ] Fix JobStatus enum/status parsing (shared + iOS)
- [ ] Fix field/param mismatches
- [ ] Document save-history DTO shape for P02

## Success Criteria
A written drift table; all identified mismatches fixed in shared + iOS models; no remaining unknowns for downstream phases.

## Risk Assessment
If drift is missed, poller hangs or save fails silently. Mitigation: exercise one real `generate-from-file` call against a dev gateway and log the raw job response.

## Next Steps
Feeds P02 (shared layer) with confirmed DTOs.
