## Context links

- Parent plan: [plan.md](../plan.md)
- Research: [researcher-01-backend.md](../research/researcher-01-backend.md)
- Locked design: [brainstorm session record](../../reports/brainstorm-260607-1517-admin-dashboard.md) (Q2: SSE auth, Q12: log file names)
- Proxy service: [examio-be/apps/gateway-service/src/services/proxy.service.ts](../../../../examio-be/apps/gateway-service/src/services/proxy.service.ts)
- Auth proxy example: [examio-be/apps/gateway-service/src/controllers/auth-proxy.controller.ts](../../../../examio-be/apps/gateway-service/src/controllers/auth-proxy.controller.ts)
- Throttler: [examio-be/apps/gateway-service/src/gateway.module.ts](../../../../examio-be/apps/gateway-service/src/gateway.module.ts) (lines 50-55, 91-94)
- Phase 01: [phase-01-backend-infra-foundation.md](phase-01-backend-infra-foundation.md)

## Overview

- **Date:** 2026-06-07
- **Track:** Backend (B)
- **Priority:** P1
- **Implementation status:** done
- **Review status:** done

Module đọc log file từ auth + gateway: `@Sse('logs/stream')` cho live tail, `GET logs/recent` cho non-streaming. PII redaction (email, token, password). Gateway proxy mới cho admin-service với named throttler.

## Key Insights

- Repo chưa có SSE / fs.watch / readline pattern — greenfield implementation.
- NestJS `@Sse` decorator + `Observable<MessageEvent>` là pattern chuẩn.
- `fs.watch` không atomic trên high-write log file — cần `readline` cho initial tail + `chokidar` hoặc manual polling cho new lines.
- PII regex list: email pattern, Bearer token, password field, JWT (3 segments base64).
- EventSource browser không gửi `Authorization` header → cần ticket-based auth (recommendation Q2).
- ProxyService union type đã extend `'admin'` từ phase 01.
- Throttler named `'admin'` 30 req/min đã register từ phase 01.

## Requirements

**Functional**

`admin-logs` module:
- `GET /admin/logs/recent?service=auth|gateway&limit=100` — đọc N dòng cuối file log, redact PII, trả JSON `{ lines: string[] }`. Auth: Bearer header.
- `POST /admin/logs/ticket` — issue short-lived SSE ticket (TTL 300s). Body: `{}`. Response: `{ ticket: string, expiresAt: ISO }`. Auth: Bearer header (admin chỉ).
- `@Sse('logs/stream')` — SSE endpoint stream log lines theo service. Query: `service: auth|gateway`, `ticket: string`. Validate ticket + revoke single-use.

**Ticket auth flow (decision Q2 — confirmed in validate session 1):**
1. Admin page → `POST /admin/logs/ticket` với Bearer → nhận `{ ticket, expiresAt }`
2. Admin page → `new EventSource(\`/api/v1/admin/logs/stream?service=auth&ticket=${ticket}\`)`
3. Backend SSE handler validate ticket qua Redis `sse:ticket:{ticket}` → userId, mark used (single-use), stream
4. Frontend handle 401 → tự request ticket mới + reconnect
5. Ticket lưu trong Redis với TTL 300s, key `sse:ticket:{ticket}` → userId

`gateway proxy`:
- `admin-proxy.controller.ts` forward tất cả `/api/v1/admin/*` → `ADMIN_SERVICE_URL`
- Re-inject Bearer + cookies + device ID + forwarded IP + UA
- KHÔNG enforce `AdminGuard` ở gateway (enforce ở admin-service để single source of truth)

`throttler`:
- Apply per-controller `@Throttle({ admin: { ttl: 60000, limit: 30 } })` cho admin endpoints
- Skip `/admin/health`

**Non-functional**
- SSE latency < 1s từ lúc file change → emit
- PII redaction: 100% mask email, token, password — không leak
- Cleanup watcher khi client disconnect (no memory leak)
- File path configurable qua env `LOGS_DIR`

## Architecture

```
admin-service/src/modules/admin-logs/
  admin-logs.service.ts
  admin-logs.controller.ts
  admin-logs.module.ts
  log-watcher.service.ts          ← fs.watch + readline abstraction
  log-redactor.util.ts            ← PII regex
  admin-logs.service.spec.ts

apps/gateway-service/src/controllers/
  admin-proxy.controller.ts       ← forward /api/v1/admin/*
```

Service pattern:
```ts
@Injectable()
export class LogWatcherService {
  private watchers = new Map<string, fs.FSWatcher>();
  private subjects = new Map<string, Subject<string>>();
  
  watch(service: 'auth' | 'gateway'): Observable<string> {
    const key = service;
    if (!this.subjects.has(key)) {
      const subject = new Subject<string>();
      const filePath = `${process.env.LOGS_DIR}/${service}-service.log`;
      
      // Initial tail: last 100 lines
      const stream = createReadStream(filePath);
      const rl = createInterface({ input: stream, crlfDelay: Infinity });
      const buffer: string[] = [];
      rl.on('line', (line) => {
        buffer.push(redactPII(line));
        if (buffer.length > 100) buffer.shift();
        subject.next(buffer[buffer.length - 1]);
      });
      
      // Watch for new content
      const watcher = fs.watch(filePath, () => {
        // Tail new content
      });
      this.watchers.set(key, watcher);
      this.subjects.set(key, subject);
    }
    return this.subjects.get(key)!.asObservable();
  }
  
  dispose(service: string) {
    this.watchers.get(service)?.close();
    this.subjects.get(service)?.complete();
    this.watchers.delete(service);
    this.subjects.delete(service);
  }
}
```

Controller:
```ts
@Sse('logs/stream')
streamLogs(@Query('service') service: 'auth' | 'gateway'): Observable<MessageEvent> {
  return this.logWatcher.watch(service).pipe(
    map((line) => ({ data: { line } })),
    takeUntil(/* cleanup on disconnect */),
  );
}
```

PII redactor:
```ts
const PII_PATTERNS = [
  /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g,  // email
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,                       // bearer token
  /"password"\s*:\s*"[^"]*"/g,                             // password field
  /eyJ[A-Za-z0-9\-._~+/]+=*\.[A-Za-z0-9\-._~+/]+=*\.[A-Za-z0-9\-._~+/]+=*/g, // JWT
];

export function redactPII(line: string): string {
  let redacted = line;
  for (const pattern of PII_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}
```

## Related code files

**New:**
- `examio-be/apps/admin-service/src/modules/admin-logs/admin-logs.service.ts`
- `examio-be/apps/admin-service/src/modules/admin-logs/admin-logs.controller.ts`
- `examio-be/apps/admin-service/src/modules/admin-logs/admin-logs.module.ts`
- `examio-be/apps/admin-service/src/modules/admin-logs/log-watcher.service.ts`
- `examio-be/apps/admin-service/src/modules/admin-logs/log-redactor.util.ts`
- `examio-be/apps/admin-service/src/modules/admin-logs/dto/recent.query.ts`
- `examio-be/apps/admin-service/src/modules/admin-logs/admin-logs.service.spec.ts`
- `examio-be/apps/gateway-service/src/controllers/admin-proxy.controller.ts`

**Modify:**
- `examio-be/apps/gateway-service/src/gateway.module.ts` — register `AdminProxyController`
- `examio-be/apps/admin-service/src/admin-service.module.ts` — import `AdminLogsModule`
- `examio-be/.env.example` — add `LOGS_DIR=/var/log/examio` (đã có từ phase 01)

## Implementation Steps

1. **log-redactor.util.ts** — implement `redactPII(line)` với 4 patterns trên. Unit test với sample log lines.
2. **log-watcher.service.ts** — `watch(service)` Observable + initial tail + fs.watch cho new content + `dispose(service)`. Use rxjs `Subject`.
3. **recent.query.ts Zod** — `service: z.enum(['auth', 'gateway'])`, `limit: z.coerce.number().int().min(1).max(1000).default(100)`.
4. **admin-logs.service.ts**:
   - `getRecent(service, limit)`: read last N lines of file, redact, return.
   - `stream(service)`: return `logWatcher.watch(service)`.
5. **admin-logs.controller.ts**:
   - `GET /admin/logs/recent?service=...&limit=...` — controller method.
   - `@Sse('logs/stream')` — return `Observable<MessageEvent>`.
   - Cả hai `@UseGuards(AdminGuard)` + `@Throttle({ admin: { ttl: 60000, limit: 30 } })`.
6. **admin-logs.module.ts** — register service + watcher.
7. **admin-proxy.controller.ts** (gateway):
   - `@Controller('admin')` (proxy base path `/api/v1/admin`)
   - `@All('*')` catch-all forward to `admin:7006/api/v1/admin/*`
   - Re-inject Bearer, cookies, device ID, IP, UA
   - Use existing `ProxyService.forward('admin', ...)` (đã extend union từ phase 01)
8. **gateway.module.ts** — import `AdminProxyController`.
9. **Cleanup mechanism** — NestJS `@Sse` tự cleanup khi client disconnect (call `observer.complete()`). Verify trong test.
10. **Unit tests**:
    - `redactPII`: email, bearer, password, JWT — all masked, structure preserved
    - `getRecent`: read last N lines, redact applied
    - `watch` + `dispose`: watcher opened on first subscribe, closed on dispose, no leak
11. **Manual test** — append line to `auth-service.log`, verify SSE event received trong < 1s.

## Todo list

- [ ] Tạo `log-redactor.util.ts` với 4 PII patterns
- [ ] Tạo `log-watcher.service.ts` (fs.watch + readline + Subject)
- [ ] Tạo `recent.query.ts` Zod
- [ ] Tạo `admin-logs.service.ts` (getRecent + stream)
- [ ] Tạo `admin-logs.controller.ts` (GET recent + @Sse stream)
- [ ] Tạo `admin-logs.module.ts`
- [ ] Tạo `admin-proxy.controller.ts` trong gateway
- [ ] Update `gateway.module.ts` register controller
- [ ] Wire `AdminLogsModule` vào `admin-service.module.ts`
- [ ] Unit tests: redactor 4 patterns, getRecent, watch lifecycle
- [ ] Manual: append log line → SSE event within 1s
- [ ] Manual: PII redaction — grep test log với email + token → masked
- [ ] Verify watcher cleanup on disconnect (no memory leak)
- [ ] `yarn build` pass
- [ ] `yarn dev:admin` + `yarn dev:gateway` boot OK
- [ ] Manual: `GET /api/v1/admin/logs/recent?service=auth&limit=10` returns 10 lines
- [ ] Manual: SSE stream từ admin page nhận được lines real-time

## Success Criteria

- [ ] `GET /api/v1/admin/logs/recent?service=auth&limit=10` trả 10 dòng cuối của auth log, PII đã redact
- [ ] SSE stream emit line mới trong < 1s sau khi file có write mới
- [ ] Email trong log line → `[REDACTED]`
- [ ] Bearer token trong log line → `[REDACTED]`
- [ ] Password field JSON trong log → `[REDACTED]`
- [ ] JWT 3-segment trong log → `[REDACTED]`
- [ ] Client disconnect → watcher closed, no memory leak
- [ ] Non-admin JWT → 403
- [ ] Throttler 30 req/min áp dụng
- [ ] Gateway proxy forward đúng path + headers

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `fs.watch` không reliable trên high-write log | Fallback: poll mỗi 500ms, check file size, read new bytes |
| PII pattern miss (vd email obfuscated) | Document limitation; phase 2 dùng structured logging (pino) với redact built-in |
| SSE qua proxy mất connection | Gateway proxy pass-through, không buffer; client reconnect logic ở frontend |
| Ticket auth (Q2) chưa implement | Phase này dùng `?token=` query — đơn giản cho MVP. Phase 2 refactor sang ticket exchange |
| Watcher leak khi service crash | `OnModuleDestroy` hook đóng tất cả watchers |
| Large file read (>100MB) blocking | `getRecent` chỉ read last N bytes bằng `fs.createReadStream` với `start` offset; không load toàn bộ file |
| `LOGS_DIR` không tồn tại | Service fail-fast lúc boot nếu `fs.access(LOGS_DIR)` fail |
| Log file rotate (x-logging 10m × 3 files) | Watch glob `*-service.log*` bao gồm rotated files (`.log.1`, `.log.2`) |

## Security Considerations

- **Critical:** PII redaction phải 100% trước khi trả cho frontend. Test với real log samples.
- **Critical:** SSE auth — dùng `?token=` (chấp nhận log risk) cho MVP, document upgrade path sang ticket exchange. Không commit JWT vào Git logs.
- **Critical:** Watcher chỉ đọc file trong `LOGS_DIR` — chống path traversal.
- Rate limit riêng cho SSE — mỗi connection = 1 stream, count trong throttler window.
- Log redaction list phải review quarterly (thêm pattern mới nếu cần).

## Next steps

- Phase 09 (frontend AdminLogs) — dùng EventSource connect tới SSE, render lines real-time.
- Phase 10 (integration) — docker compose mount `examio_logs` volume, e2e test SSE t�ng frontend → backend.

## Implementation Notes

- Ticket auth implemented via raw `ioredis` (not via `libs/redis` RedisService)
- Redis key `sse:ticket:{ticket}` with TTL 300s, single-use (marked used on validate)
- `GET /admin/logs/recent` reads last N lines of log file, redact PII
- `@Sse('logs/stream')` SSE endpoint streams new log lines with PII redacted
- log-watcher uses `fs.watch` + `readline` for tail + initial buffer (last 100 lines)
- 4 PII patterns: email, Bearer token, password field, JWT 3-segment
- admin-proxy.controller.ts in gateway forwards all `/api/v1/admin/*` → admin-service
- Re-injects Bearer + cookies + device ID + forwarded IP + UA
- Cleanup on client disconnect (no memory leak) via rxjs takeUntil + `OnModuleDestroy`
