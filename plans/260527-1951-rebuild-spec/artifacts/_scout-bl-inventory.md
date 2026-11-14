# Scout Behavior Logic Inventory

## Backend BL Sources
- Auth/session lifecycle: kmaedu-be/apps/auth-service/src/auth.service.ts, devices/*, profile/*
- Gateway proxy behavior: kmaedu-be/apps/gateway-service/src/controllers/*, services/proxy.service.ts
- Exam/study domain: kmaedu-be/apps/exam-service/src/modules/**/{*.service.ts,*.repository.ts,*.controller.ts}
- Finance/payment/subscription: kmaedu-be/apps/finance-service/src/modules/**, events/user-event.handler.ts
- R2/OCR/AI integrations: kmaedu-be/apps/r2-service/src/**, kmaedu-be/apps/ocr-service/src/**, kmaedu-be/apps/ai-service/src/backend/**
- Shared auth/events/gRPC behavior: kmaedu-be/libs/common/src/**

## Frontend BL Sources
- Auth/session/refresh: kmaedu-fe/src/apis/api.ts, src/stores/useAuthStore.ts, src/hooks/useAuthSync.ts, src/routes/guards/*.tsx
- Feature state/API orchestration: kmaedu-fe/src/stores/*.ts, src/apis/*.ts
- Exam proctoring/security: kmaedu-fe/src/hooks/useCheatingDetection.ts, src/lib/secureQuizHelpers.ts, src/lib/crypto.ts
- Cache behavior: kmaedu-fe/src/lib/storeCache.ts

## Mobile BL Sources
- Shared network/auth/repos: kmaedu-app/shared/src/commonMain/kotlin/com/kmaedu/app/**
- Android auth/navigation: kmaedu-app/androidApp/src/main/kotlin/com/kmaedu/app/**
- iOS auth/navigation: kmaedu-app/iosApp/KMAEduApp/**

## Known Caveats
- Mobile platform UI is largely mock data; shared KMP repositories are real.
- iOS KMP SecureTokenStorage is stubbed; Swift AuthViewModel has private KeychainTokenStore.
- Frontend TeacherRoute does not enforce teacher/admin role.
- Backend Prisma schema duplicates/diverges between src/ and prisma/ trees; later waves must cite actual used schema.
