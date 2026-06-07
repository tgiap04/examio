# Validation Log — Admin Dashboard Plan

## Session 1 — 2026-06-07
**Trigger:** Plan vừa viết xong (1 plan.md + 10 phase files + 2 research). User chọn "Có, validate (Recommended)".

**Questions asked:** 4 (Q1–Q4 từ open question list trong plan.md, 7 câu còn lại đã chốt implicit trong locked design)

### Questions & Answers

1. **[Architecture]** Q1 — Refund status code dùng giá trị nào?
   - Options: Extend enum `4 = refunded` | Reuse `3 = cancelled` + description | Tạo table RefundLog riêng
   - **Answer:** Extend enum: thêm 4 = refunded
   - **Rationale:** Tách biệt ngữ nghĩa (refund vs cancel), dễ query, dễ thống kê. Migration chỉ thêm comment, không phá column type. Tránh over-engineer với bảng riêng.
   - **Phase impact:** phase-06 (admin-finance) — đã ghi `// 4 = refunded` trong schema, confirm lại. Không cần đổi.

2. **[Architecture]** Q2 — SSE auth vì EventSource không gửi header?
   - Options: Query string `?token=` (MVP) | Ticket exchange | fetch + ReadableStream
   - **Answer:** Ticket exchange
   - **Rationale:** Tránh JWT leak trong nginx/CDN log. An toàn hơn `?token=`. Phase 7 sẽ thêm endpoint `POST /admin/logs/ticket` issue short-lived ticket (300s, single-use, lưu Redis key `sse:ticket:{ticket}` → userId). Phase 9 update `useEventSource` hook để xử lý 401 → tự request ticket mới.
   - **Phase impact:** phase-07 (admin-logs) — thêm endpoint + Redis ticket storage. phase-09 (frontend) — update `useEventSource` với ticket refresh logic.

3. **[Architecture]** Q3 — Table library cho AdminUsers và AdminAudit?
   - Options: antd Table (Recommended) | shadcn-style extension | Native HTML table
   - **Answer:** antd Table (Recommended)
   - **Rationale:** Full-featured (filter, sort, pagination, virtual scroll), antd `ConfigProvider` đã themed với DESIGN.md tokens ở phase 02. Bundle +100KB chấp nhận được cho admin route (chỉ admin load).
   - **Phase impact:** phase-09 (frontend) — confirm dùng antd `Table` cho `UserTable`, `AuditTable`. Không đổi.

4. **[Architecture]** Q4 — User ban / delete: soft hay hard?
   - Options: Soft delete với `deletedAt` (Recommended) | Chỉ `isBanned = true` | Hard delete (cascade)
   - **Answer:** Soft delete với `deletedAt` (Recommended)
   - **Rationale:** Bảo toàn foreign key từ `UserSession`, `Payment`, `WalletTransaction`. Audit chain không gãy (vẫn query được user bị ban từ AdminAudit). Tránh cascade phá user history.
   - **Phase impact:** phase-04 (admin-users) — đã có `deletedAt` + `isBanned` trong schema update. Confirm lại pattern: ban → cả 2 field, unban → set null + false. Không cần đổi.

### Confirmed Decisions
- **Refund status = 4** (extend enum, comment-only change) — phase-06
- **SSE auth = ticket exchange** (Redis-backed, 300s TTL, single-use) — phase-07 + phase-09
- **Table = antd Table** — phase-09
- **User delete = soft delete** (`deletedAt` + `isBanned`) — phase-04

### Action Items
- [x] Update phase-07 với ticket exchange flow
- [x] Update phase-09 với ticket-based EventSource
- [x] Update plan.md "Open Questions" section với status cho mỗi câu
- [x] Update phase-04 với "(Decision Q4: soft delete)" note
- [ ] (defer v2) Audit retention policy — note trong phase-10 future phases

### Impact on Phases
- **Phase 04** (admin-users): no change (đã soft delete)
- **Phase 06** (admin-finance): no change (đã ghi `// 4 = refunded`)
- **Phase 07** (admin-logs): thêm `POST /admin/logs/ticket` endpoint, Redis ticket storage, ticket validation trong SSE handler
- **Phase 09** (frontend): update `useEventSource` hook để gọi `postLogTicketApi()` khi EventSource nhận 401, retry kết nối
- **Phase 10** (integration): e2e test cho ticket flow (issue → use → revoke → expired)

### Confirmed Earlier (locked design từ brainstorm, không re-ask)
- Bootstrap placement: auth-service `OnModuleInit`
- i18n: chỉ tiếng Việt
- Throttler: named `'admin'` per-controller
- Sidebar admin link: yes, gated `user.isAdmin` (phase 10)
- gRPC vs HTTP: HTTP qua gateway proxy
- Log file names: `{service}-service.log` trong `LOGS_DIR=/var/log/examio`
- `ADMIN_DEFAULT_PASSWORD`: first-time-only update
