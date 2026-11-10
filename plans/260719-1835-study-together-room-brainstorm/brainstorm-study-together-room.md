# Brainstorm — Phòng học chung (Study-Together Room)

> Ngày: 2026-07-19 · Vai tư vấn: CTO (mặc định) · Level: medium
> Trạng thái: **Thiết kế đã chốt — chưa lập plan**

## Commission (đề bài)

Một trang/layout riêng cho phép **nhiều người học cùng nhau** trong một phòng, với:

- **Pomodoro đồng bộ** — cấu hình thời gian học/nghỉ (ví dụ học 30p, nghỉ 5p), chạy đồng bộ cho cả phòng.
- **Nghe nhạc chung** và **xem video chung** qua **link YouTube**, đồng bộ play/pause/seek.
- Cảm giác "học chung": biết ai đang trong phòng, ai đang học / đang nghỉ.

## Requirements đã chốt (qua clarification)

| Hạng mục | Quyết định |
|---|---|
| Mô hình điều khiển | **Host + co-host được uỷ quyền** điều khiển timer/nhạc/video; thành viên còn lại follow |
| Nguồn media | **YouTube cho cả nhạc lẫn video** (một tích hợp YouTube IFrame API, không lo bản quyền/OAuth) |
| Nền tảng | **Chỉ web (kmaedu-fe)** ở bản đầu; mobile để phase sau |
| Loại phòng | **Phòng riêng tư, join bằng mã mời**; **model `StudyRoom` MỚI**, tách khỏi `ExamRoom` |
| Lớp social | **Live roster** (avatar + trạng thái học/nghỉ) + **Chat text** + **Thống kê thời gian tập trung / leaderboard** |
| Vòng đời phòng | **Phòng nhỏ (~10–20), bền theo host**, host đóng/mở lại được |
| WebRTC (camera/voice) | **Loại khỏi scope bản đầu**, để phase rất sau |

## Bối cảnh codebase (khảo sát)

- **Không có WebSocket** trong toàn backend — không `socket.io`, không `@nestjs/websockets`. Real-time hiện tại chạy bằng **SSE + Redis pub/sub** (AI chat, admin logs, config toggles) + RabbitMQ (service-to-service), gRPC (RPC nội bộ).
- **Gateway-service proxy mặc định là buffered (Axios)**; chỉ admin-logs có SSE streaming pass-through đúng chuẩn (`axiosRef({responseType:'stream'})` + `pipe`). **Gateway KHÔNG có WebSocket upgrade proxying.**
- Auth cho stream: **one-time Redis ticket** (vì EventSource không gửi được header Authorization).
- Mô hình phòng tái sử dụng được: `ExamRoom → ExamSession → ExamAttempt`, join bằng **mã 6 số + whitelist** (`assessType`, `accessCode` indexed). Membership hiện là suy ra từ `ExamAttempt`, presence bằng polling auto-save (`PUT examattempts/:id/progress`).

## Các con đường đã cân nhắc

### Path A — SSE (xuống) + HTTP POST (lên) + Redis pub/sub
Tái dụng ~100% hạ tầng sẵn có. Kênh xuống SSE mỗi phòng (auth Redis ticket, gateway streaming pass-through kiểu admin-logs), kênh lên HTTP POST, fan-out Redis pub/sub `studyroom:{id}`, timer tính tất định client-side.
- **Ưu:** không thêm dependency, multi-instance an toàn, team đã quen, đúng profile sự kiện tần suất thấp, rủi ro thấp, ra mắt nhanh.
- **Nhược:** SSE một chiều (chiều lên bằng HTTP — chấp nhận được); chat trễ hơn WS chút; phải cẩn thận đi đúng đường streaming pass-through, tránh `forwardWithAuth` buffered.

### Path B — Socket.io / WebSocket gateway ✅ **ĐÃ CHỌN**
`@nestjs/websockets` + `@nestjs/platform-socket.io` + Redis adapter. Hai chiều thật, socket.io rooms native, latency chat/presence thấp nhất.
- **Ưu:** sạch nhất cho chat/presence dài hạn; nền tảng sẵn nếu sau này làm WebRTC signaling / collab lớn; mô hình "rooms" khớp trực tiếp với khái niệm phòng học.
- **Nhược (phải xử lý ở plan):** net-new hoàn toàn trong codebase chưa từng có WS; **gateway không proxy được WS upgrade**; cần Redis adapter + cân nhắc sticky session; thêm dependency + operational surface mới; team chưa quen pattern.

### Path C — Polling thuần
Loại: fail yêu cầu sync video/timer (trễ 2–3s, drift), chat như chết, tốn tài nguyên.

## Hướng đã chốt: **Path B (Socket.io/WebSocket)**

> Người commission chọn Path B thay vì khuyến nghị Path A, ưu tiên nền tảng real-time hai chiều dài hạn.

### Thiết kế đề xuất (Path B)

**Dependencies mới (backend):** `@nestjs/websockets`, `@nestjs/platform-socket.io`, `@socket.io/redis-adapter` (fan-out đa instance), `socket.io-client` (frontend).

**Prisma — model mới (`libs/database/src/schema.prisma`):**
- `StudyRoom` — `id`, `name`, `hostId`, `inviteCode` (6 số, `@@index`), `workMinutes`, `breakMinutes`, `longBreakMinutes?`, `cyclesBeforeLongBreak?`, `currentVideoUrl?`, `isActive`, `maxParticipants`, audit fields.
- `StudyRoomMember` — `id`, `studyRoomId`, `userId`, `role` (HOST | COHOST | MEMBER), `joinedAt`, `lastSeenAt`, `totalFocusSeconds` (cho leaderboard). `@@unique([studyRoomId, userId])`.
- `StudyRoomMessage` — `id`, `studyRoomId`, `userId`, `content`, `createdAt` (chat có lịch sử nhẹ; hoặc ephemeral trong Redis nếu muốn tiết kiệm).

**Live state ở Redis (không phải DB):** pha timer + `phaseStartedAt` + running/paused; video/nhạc `{url, state, positionSec, at}`; roster presence (heartbeat, status học/nghỉ). Redis adapter đồng bộ giữa các instance.

**Backend — WebSocketGateway trong exam-service (`modules/study-room/`):**
- Namespace/room socket.io = một `StudyRoom`.
- Auth qua **socket.io handshake** (`handshake.auth.token` = JWT) — không cần Redis ticket như SSE.
- Events (client→server): `room:join`, `room:leave`, `timer:start|pause|reset|config`, `media:set|play|pause|seek`, `chat:send`, `presence:heartbeat`, `role:grant|revoke`.
- Events (server→client): `room:snapshot`, `timer:updated`, `media:updated`, `presence:updated`, `chat:message`, `role:updated`, `room:closed`.
- **Phân quyền kiểm ở server:** mọi action điều khiển (timer/media/role) chỉ chấp nhận từ HOST/COHOST.
- REST song song (CRUD phòng, verify mã mời, lịch sử chat, leaderboard) đi qua controller HTTP như bình thường.

**Gateway — QUYẾT ĐỊNH LỚN cho plan:** gateway chưa proxy WS. Hai lựa chọn:
- (a) Thêm WS upgrade proxying vào gateway-service (ví dụ `http-proxy`/engine.io passthrough), giữ một điểm vào duy nhất.
- (b) Phơi endpoint WS đi thẳng tới exam-service (bypass HTTP gateway), CORS + JWT qua handshake; đơn giản hơn nhưng tách điểm vào.
- REST của study-room vẫn qua gateway proxy như các domain khác.

**Frontend (kmaedu-fe):**
- Page + layout `pages/study-room/` (+ route trong `src/routes`).
- `apis/studyRoomApi.ts` (REST: CRUD, verify mã, chat history, leaderboard).
- `stores/useStudyRoomStore.ts` (Zustand — room state, roster, chat, timer/media snapshot).
- Hook `useStudyRoomSocket` (socket.io-client, JWT handshake, reconnect).
- Component: YouTube IFrame wrapper (đồng bộ play/pause/seek), Pomodoro timer **tính client-side** từ `phaseStartedAt + config`, roster panel, chat panel.

## Cần canh chừng (implementation risks)

1. **Gateway WS proxying** — chốt (a) hay (b) trước khi code; đây là chi phí net-new lớn nhất của Path B.
2. **Multi-instance fan-out** — bắt buộc dùng `@socket.io/redis-adapter`, nếu không events không tới người ở instance khác.
3. **Drift đồng bộ video** — client seek tới `positionSec + (now − at)` khi nhận event và hiệu chỉnh định kỳ; xử lý buffering/khác tốc độ mạng.
4. **Presence "ma"** — heartbeat + TTL để dọn thành viên rớt mạng; cập nhật `lastSeenAt`.
5. **Phân quyền server-side** — không tin client; mọi lệnh điều khiển kiểm role ở gateway handler.
6. **Reconnect/resume** — khi client reconnect phải nhận lại `room:snapshot` để đồng bộ ngay trạng thái timer/media/roster.
7. **Sticky session** (nếu scale ngang có LB) — hoặc dùng transport websocket-only để tránh vấn đề polling upgrade.

## Cách đo thành công (validation)

- 2+ client trong cùng phòng: host start/pause/đổi video → mọi client cập nhật < ~1s.
- Client reconnect nhận đúng snapshot, timer khớp pha.
- Co-host được uỷ quyền điều khiển được; MEMBER thì không (server chặn).
- `totalFocusSeconds` cộng dồn đúng qua nhiều phiên → leaderboard chính xác.

## Bước tiếp theo

- **Chưa lập plan** (theo yêu cầu). Khi sẵn sàng: chạy `/tkm:create-plan` với file này làm context; plan nên tách phase: (1) Prisma model + migration, (2) backend WS gateway + module + phân quyền, (3) quyết định & wiring gateway WS proxy, (4) frontend page/timer/media/roster/chat, (5) stats/leaderboard, (6) tests.
- Câu hỏi mở còn lại: chốt (a) vs (b) cho gateway WS; chat lưu DB hay ephemeral; long-break Pomodoro có cần không.
