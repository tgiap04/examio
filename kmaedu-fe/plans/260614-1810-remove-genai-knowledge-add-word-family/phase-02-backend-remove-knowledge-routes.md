# Phase 2 — Backend: Remove Knowledge-Base Routes (NestJS)

## Context
- Parent plan: `plan.md` — Remove GenAI Knowledge + Add Word Family
- Depends on: nothing (independent)
- Preserves: AI Chat module, file upload/generation routes, quiz/flashcard generation

## Overview
- Priority: P2
- Status: pending
- Description: Remove knowledge-base (tutor) routes from AIController/AIService/AIRepository in exam-service, and knowledge-specific proxy routes from gateway's AIProxyController

## Scope

### Files to Modify (exam-service)
| File | Change |
|------|--------|
| `apps/exam-service/src/modules/ai/ai.controller.ts` | Remove all 25 `tutor/*` route methods |
| `apps/exam-service/src/modules/ai/ai.service.ts` | Remove `tutor*` methods that proxy to Python `/tutor/*` |
| `apps/exam-service/src/modules/ai/ai.repository.ts` | Remove `tutor*` methods if any |

### Files to Modify (gateway)
| File | Change |
|------|--------|
| `apps/gateway-service/src/controllers/ai-study-proxy.controller.ts` | Remove knowledge-specific proxy routes from `AIProxyController` |

### Files to Preserve
- `apps/exam-service/src/modules/ai-chat/` — entire module (independent)
- `apps/exam-service/src/modules/ai/ai.module.ts` — keep (still serves non-tutor routes)
- 12 shared routes in AIController: `quick-upload`, `generate-from-file`, `recent-uploads`, `models`, `upload/*`, `job/*`, `upload-image`, `regenerate/*`
- `AIChatProxyController` in gateway (separate controller class)

## Implementation Steps

1. **Read and classify methods in `ai.controller.ts`**
   - Keep: 12 shared/utility methods (upload, job, generate, models, etc.)
   - Remove: 25 tutor/* methods

2. **Remove tutor methods from `ai.controller.ts`**
   - Delete all methods with `@Get('tutor/...')`, `@Post('tutor/...')`, `@Delete('tutor/...')` decorators
   - Keep shared `@Post('upload')`, `@Post('generate-from-file')`, etc.

3. **Remove tutor methods from `ai.service.ts`**
   - Remove methods that call `AI_SERVICE_URL` + `/tutor/*` paths
   - Keep methods that call non-tutor paths

4. **Remove tutor proxy routes from gateway `AIProxyController`**
   - Delete all `@All('*tutor*')` or knowledge-specific proxy methods
   - Keep non-tutor proxy routes

5. **Verify build**
   - `cd kmaedu-be && yarn build`

## Success Criteria
- All non-tutor AI routes still work (upload, generate, models)
- AI Chat remains fully functional
- TypeScript compiles with zero errors
