# Phase 05 — Validate Performance and Regressions

## Context Links
- `../examio-be/apps/ai-service`
- `../examio-be/apps/exam-service/src/modules/ai/ai.service.ts`
- `../examio-fe/src/stores/useAIGeneratorStore.ts`

## Overview
Priority: critical  
Status: implemented  
Verify speed gains, correctness, job status behavior, and frontend polling behavior after backend optimization.

## Key Insights
- Previous frontend bug polled forever when backend returned `completed` without result.
- Backend status semantics must remain clear: OCR/embedding completion is not the same as quiz/flashcard result availability.
- Performance work needs before/after numbers from identical inputs.

## Requirements
- Validate OCR-only job completion.
- Validate quiz generation job completion with result.
- Validate flashcard generation job completion with result.
- Validate failure path returns a terminal status and useful message.
- Run build/compile checks for modified workspace(s).

## Related Code Files
Read/validate:
- `../examio-be/apps/exam-service/src/modules/ai/ai.service.ts`
- `../examio-fe/src/stores/useAIGeneratorStore.ts`

Commands:
- `cd ../examio-be && yarn build`
- If frontend touched: `cd . && yarn build`
- Python syntax/lint if available: `cd ../examio-be/apps/ai-service && ./venv/bin/ruff check src` or targeted Python compile.

## Implementation Steps
1. Re-run baseline scenarios after each optimization phase.
2. Compare stage timings in a table: OCR, prepare chunks, embedding, DB store, retrieval, graph, generation, save history, total.
3. Validate DB query plans after schema/index changes.
4. Confirm FE job polling stops on completed/failed states.
5. Confirm backend returns explicit messages for completed OCR-only states.
6. Run compile/build checks for touched backend/frontend code.

## Todo List
- [ ] Validate OCR-only workflow.
- [ ] Validate quiz generation workflow.
- [ ] Validate flashcard generation workflow.
- [ ] Validate failed job workflow.
- [ ] Run backend build and Python checks.
- [ ] Run frontend build if frontend changed.

## Success Criteria
- Before/after timing table proves improvements.
- No new job status regressions.
- No syntax/build errors.
- No quality regression in generated quiz/flashcard structure.

## Risk Assessment
- Local benchmark results may differ from production hardware.
- If production Ollama has lower capacity, env defaults must stay conservative.

## Security Considerations
- Do not include user document text in reports or logs.

## Next Steps
After validation, update plan status and ask whether to implement follow-up production configuration changes.
