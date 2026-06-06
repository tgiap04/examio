## Background Logic Source Inventory

### NestJS (TypeScript)

- custom-command: _(none found)_
- event-listener: examio-be/apps/finance-service/src/user-event.handler.ts
- integration: examio-be/apps/auth-service/src/auth.service.ts
- integration: examio-be/apps/exam-service/src/modules/finance-client/finance-client.service.ts
- integration: examio-be/apps/exam-service/src/modules/r2/r2-client.service.ts
- integration: examio-be/apps/r2-service/src/r2.service.ts
- integration: examio-be/apps/ocr-service/src/ocr.service.ts
- mail: examio-be/libs/common/src/services/mail.service.ts
- middleware: examio-be/libs/common/src/middleware/session-validation.middleware.ts
- notification: _(none found)_
- observer: _(none found)_
- queue-worker: _(none found)_
- scheduled-job: examio-be/apps/auth-service/src/session-cleanup.cron.ts
- webhook: examio-be/apps/finance-service/src/webhook.controller.ts
- webhook: examio-be/apps/gateway-service/src/controllers/webhook-proxy.controller.ts

### React/Next.js (TypeScript/JS)

- custom-command: _(none found)_
- event-listener: _(none found)_
- integration: examio-fe/src/components/auth/AuthSyncBootstrap.tsx
- mail: _(none found)_
- middleware: _(none found)_
- notification: _(none found)_
- observer: _(none found)_
- queue-worker: _(none found)_
- scheduled-job: _(none found)_
- webhook: _(none found)_
- background: examio-fe/src/hooks/useCheatingDetection.ts
- background: examio-fe/src/hooks/useExportPDF.ts
- background: examio-fe/src/hooks/useGenerationGuard.ts
- background: examio-fe/src/pages/exam-session/ExamQuizPage.tsx [SIGNAL_INFERRED]
  - Intent matched: background — API polling via useEffect for quiz progress
  - No-row reason: stack=React 19 SPA, no row in bl-source-patterns.md
  - Observed pattern: useEffect triggers setInterval polling updateExamAttemptProgressApi; sendBeacon on beforeunload

### Python (FastAPI)

- custom-command: _(none found)_
- event-listener: _(none found)_
- integration: _(none found)_
- mail: _(none found)_
- middleware: _(none found)_
- notification: _(none found)_
- observer: _(none found)_
- queue-worker: _(none found)_
- scheduled-job: _(none found)_
- webhook: _(none found)_

