# Scout Behavior Logic Inventory

## Backend BL Sources
- Auth/session lifecycle: examio-be/apps/auth-service/src/auth.service.ts, devices/*, profile/*
- Gateway proxy behavior: examio-be/apps/gateway-service/src/controllers/*, services/proxy.service.ts
- Exam/study domain: examio-be/apps/exam-service/src/modules/**/{*.service.ts,*.repository.ts,*.controller.ts}
- Finance/payment/subscription: examio-be/apps/finance-service/src/modules/**, events/user-event.handler.ts
- R2/OCR/AI integrations: examio-be/apps/r2-service/src/**, examio-be/apps/ocr-service/src/**, examio-be/apps/ai-service/src/backend/**
- Shared auth/events/gRPC behavior: examio-be/libs/common/src/**

## Frontend BL Sources
- Auth/session/refresh: examio-fe/src/apis/api.ts, src/stores/useAuthStore.ts, src/hooks/useAuthSync.ts, src/routes/guards/*.tsx
- Feature state/API orchestration: examio-fe/src/stores/*.ts, src/apis/*.ts
- Exam proctoring/security: examio-fe/src/hooks/useCheatingDetection.ts, src/lib/secureQuizHelpers.ts, src/lib/crypto.ts
- Cache behavior: examio-fe/src/lib/storeCache.ts

## Mobile BL Sources
- Shared network/auth/repos: examio-app/shared/src/commonMain/kotlin/com/examio/app/**
- Android auth/navigation: examio-app/androidApp/src/main/kotlin/com/examio/app/**
- iOS auth/navigation: examio-app/iosApp/ExamioApp/**

## Known Caveats
- Mobile platform UI is largely mock data; shared KMP repositories are real.
- iOS KMP SecureTokenStorage is stubbed; Swift AuthViewModel has private KeychainTokenStore.
- Frontend TeacherRoute does not enforce teacher/admin role.
- Backend Prisma schema duplicates/diverges between src/ and prisma/ trees; later waves must cite actual used schema.
