# Phase 05 — Gateway Proxy: REST + WS Upgrade

## Context Links

- Plan: [plan.md](plan.md) · Depends: phase-02 (REST), phase-03 (WS path)
- Pattern REST proxy: `examio-be/apps/gateway-service/src/controllers/examroom-proxy.controller.ts` (`forwardWithAuth`, `@TogglePage`)
- Gateway main/bootstrap: `apps/gateway-service/src/main.ts`

## Overview

- **Priority:** High · **Status:** ✓ done
- Quyết định đã chốt: **(a) một điểm vào duy nhất** — gateway proxy cả REST lẫn WS upgrade cho study-room. Đây là phần net-new rủi ro nhất của plan → WS proxy via http-proxy implementation complete.
- Gateway WS upgrade proxy path `/ws/study` configured; REST study-room routes proxied with `@TogglePage('study-room')`.

## Requirements

- REST: mirror mọi route `studyrooms/*` (phase 2) → exam-service, guard `PageEnabledGuard` + `@TogglePage('study-room')`.
- WS: HTTP Upgrade request tới path `/ws/study` được proxy nguyên vẹn (headers, query) tới exam-service; hoạt động qua cả polling fallback lẫn websocket transport — hoặc chốt websocket-only (xem step 3).

## Implementation Steps

1. **Spike trước:** proof 10 phút — thêm `http-proxy` (`yarn add http-proxy` + types) và wire:

```typescript
// main.ts gateway-service, sau app.listen(...)
import * as httpProxy from 'http-proxy';
const wsProxy = httpProxy.createProxyServer({
    target: process.env.EXAM_SERVICE_URL, // đã có sẵn env này cho REST proxy
    ws: true,
    changeOrigin: true,
});
const server = app.getHttpServer();
server.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/ws/study')) {
        wsProxy.ws(req, socket, head);
    } else {
        socket.destroy();
    }
});
wsProxy.on('error', (err, req, socket) => { socket?.destroy?.(); /* + log qua logger gateway */ });
```

2. Nếu spike fail với NestJS http server → fallback đã duyệt sẵn: dùng `http-proxy-middleware` (`createProxyMiddleware({ target, ws: true, pathFilter: '/ws/study' })`) mount ở `app.use()` + gọi `.upgrade` thủ công trên server event. Một trong hai PHẢI chạy trước khi viết tiếp.
3. **Transport:** để tránh vấn đề sticky-session của polling qua nhiều instance gateway, cấu hình socket.io client (phase 6) `transports: ['websocket']` — bỏ HTTP long-polling. Ghi rõ quyết định này vào study-room.events.ts.
4. `studyroom-proxy.controller.ts`: mirror các route phase 2 theo đúng pattern examroom-proxy (forwardWithAuth, giữ nguyên path `/api/v1/studyrooms/...` downstream).
5. Đăng ký toggle page `study-room` (xem cách các page khác đăng ký trong admin page-config để FE flag hoạt động).
6. Kiểm tra deploy: `examio-be/deploy/docker-compose.yml` — gateway đã expose; xác nhận không cần mở port mới (đó là lý do chọn (a)). Nginx/LB phía trước (nếu có) cần `proxy_set_header Upgrade/Connection` — ghi chú vào README deploy nếu file nginx nằm trong repo.

## Todo

- [x] Spike WS proxy chạy được (client → gateway → exam-service echo)
- [x] Chốt websocket-only transport
- [x] studyroom-proxy.controller.ts đủ route
- [x] TogglePage 'study-room' đăng ký
- [x] http-proxy integrated in main.ts
- [x] Ghi chú deploy (upgrade headers)

## Success Criteria

- socket.io-client trỏ vào **gateway URL** path `/ws/study` connect + join + nhận broadcast như khi trỏ thẳng exam-service; REST studyrooms qua gateway hoạt động với auth.

## Risks

- Upgrade event có thể bị body-parser/middleware khác can thiệp — wire sau khi app init đầy đủ, test sớm.
- Timeout/idle: kiểm proxy không cắt kết nối im lặng (socket.io tự ping 25s — đủ giữ alive qua LB mặc định).
