# Scout: Gateway Proxy & Auth Guard Patterns

## Gateway Structure
```
gateway-service/src/
├── controllers/   # One proxy controller per downstream service
│   ├── admin-proxy.controller.ts   # SSE + @All catch-all
│   ├── auth-proxy.controller.ts    # Login, OAuth, logout
│   ├── exam-proxy.controller.ts     # QuizSets, Flashcards, Rooms
│   └── ... (10+ other proxy controllers)
├── services/proxy.service.ts        # Core forwarding logic
├── middleware/proxy.middleware.ts
└── gateway.module.ts               # Imports AuthModule, RedisModule, ProxyService, all controllers
```

## Proxy Pattern
- **No `@UseGuards()` on gateway** — auth is delegated to downstream services.
- Gateway extracts token: `Bearer header` OR `req.cookies.token/accessToken` (priority order).
- Uses `ProxyService.forwardWithAuth(service, req, token)` to inject Bearer into forwarded request.

## ProxyService Methods (apps/gateway-service/src/services/proxy.service.ts)
```typescript
private readonly serviceUrls = {
    auth:    process.env.AUTH_SERVICE_URL    || 'http://localhost:3001',
    exam:    process.env.EXAM_SERVICE_URL     || 'http://localhost:3002',
    finance: process.env.FINANCE_SERVICE_URL || 'http://localhost:3003',
    admin:   process.env.ADMIN_SERVICE_URL   || 'http://localhost:7006',
};
// forward()         — public routes, admin catch-all (cookies forwarded)
// forwardWithAuth()  — authenticated user routes (Bearer injected)
// forwardWithAuthAndTimeout() — long-running / streaming (custom timeout)
// forwardWithRedirect() — OAuth flows (no redirect follow)
// forwardRaw()       — multipart/form-data uploads
```

## AuthGuard (libs/common/src/guard/auth.guard.ts)
- **Import**: `import { AuthGuard } from '@kmaedu/common';`
- Checks: token valid → DB user exists → not banned/deleted → email verified.
- Attaches user to `request['user']`.
- **Usage in downstream**: `@UseGuards(AuthGuard)` on controllers.

## AdminGuard (libs/common/src/guard/admin.guard.ts)
- **Import**: `import { AdminGuard } from '@kmaedu/common';`
- Same logic as AuthGuard + extra check: `if (!user.isAdmin) throw ForbiddenException`.
- **Usage in downstream**: `@UseGuards(AdminGuard)` on admin-only controllers.

## Redis Pattern (exam-service)
- **Import**: `import { RedisService } from '@kmaedu/redis';`
- Direct injection in `providers[]` — no `@InjectRedis()` decorator needed.
- Used in: `QuizsetModule`, `ExamSessionModule`, and likely others.
```typescript
@Module({
    imports: [AuthModule, GrpcClientsModule.registerR2Client()],
    providers: [RedisService, QuizsetService, ...],
    exports: [QuizsetService, QuizSetRepository],
})
export class QuizsetModule {}
```

## Key Export (libs/common/src/index.ts)
```typescript
export * from './guard/auth.guard';   // → @kmaedu/common
export * from './guard/admin.guard';  // → @kmaedu/common
```
Both guards are re-exported via the `@kmaedu/common` barrel. Downstream services import guards from `@kmaedu/common`, not from the guard file directly.
