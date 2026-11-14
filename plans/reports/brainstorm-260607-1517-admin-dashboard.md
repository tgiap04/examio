# Tư vấn: Admin Dashboard — Session Record

**Ngày:** 2026-06-07 **Người yêu cầu:** Tobi **Trạng thái:** Design đã chốt, chờ phê duyệt để sang `/tkm:create-plan`

---

## Commission (yêu cầu thật)

Xây dựng trang dashboard chỉ dành cho admin:

- Tài khoản admin cấu hình sẵn trong env của backend service
- Thống kê người dùng (tổng, theo ngày/tháng/năm)
- Lưu lượng truy cập
- Số tài khoản theo gói subscription (Pro/VIP)
- Đọc log backend
- Cho phép thao tác tài chính (refund, credit, tier) + quản lý user

---

## Paths đã xem xét

| Path | Mô tả | Đã chọn? |
| --- | --- | --- |
| A: admin-service riêng | Tạo Nest service mới, proxy qua gateway | ✅ |
| B: lồng vào auth-service | Module trong auth-service | ❌ |
| C: hybrid | Bắt đầu lồng auth, tách sau | ❌ |

Lý do chọn A: dự án đã là monorepo đa service, admin có traffic riêng và có audit/rủi ro tài chính nên cần tách biệt. Path C hợp lý nếu cần MVP cực nhanh, nhưng user đã chốt A.

---

## Agreed Direction (thiết kế chốt)

### Backend

- **Service mới**: `kmaedu-be/apps/admin-service/` (NestJS, port 7006, gRPC 50056)

- **Modules**:

  - `admin-bootstrap` — sync `ADMIN_EMAILS` CSV mỗi lần boot (create / update / grant isAdmin / update password)
  - `admin-users` — list/filter users, grant/revoke isAdmin, soft delete user
  - `admin-stats` — user growth, traffic (UserSession), doanh thu (Payment + WalletTransaction)
  - `admin-finance` — refund, cộng/trừ credits, đổi tier subscription (tất cả phải ghi audit)
  - `admin-logs` — đọc/tail file log từ auth + gateway
  - `admin-audit` — query AdminAudit table

- **Guards**:

  - `AdminGuard` trong `libs/common/src/guards/` — extends `AuthGuard`, check `isAdmin === true`
  - `AdminBootstrapService` chạy trong `OnModuleInit` của `auth-service` (gần User)

- **Database**:

  - Thêm model `AdminAudit` (id, adminId, action, targetId, payload JSON, reason, ipAddress, userAgent, createdAt)
  - Index theo `(adminId, createdAt)` và `(action, createdAt)`

- **Infra**:

  - `docker-compose.yml`: thêm `admin` service, share `logs/` volume với auth + gateway
  - `.env.example`: thêm `ADMIN_EMAILS`, `ADMIN_DEFAULT_PASSWORD`, `ADMIN_SERVICE_URL`, `LOG_DIR`
  - Gateway: thêm `admin-proxy.controller.ts` cho `/api/v1/admin/*`

- **Env**:

  ```
  ADMIN_EMAILS=admin1@kmaedu.fayedark.com,admin2@kmaedu.fayedark.com
  ADMIN_DEFAULT_PASSWORD=<secure-random-min-32>
  ADMIN_SERVICE_URL=http://admin:7006
  LOG_DIR=/var/log/kmaedu
  ```

### Frontend

- **Pages mới** trong `kmaedu-fe/src/pages/admin/`:
  - `AdminLayout.tsx` — sidebar + header với role check
  - `AdminOverviewPage.tsx` — 4 KPI cards + 3 mini charts
  - `AdminUsersPage.tsx` — DataTable với filter (search, role, tier, createdAt range)
  - `AdminStatsPage.tsx` — charts: user growth (line), traffic (bar), revenue (line)
  - `AdminFinancePage.tsx` — bảng giao dịch + form refund/credit/tier (modal với confirm 2 bước)
  - `AdminLogsPage.tsx` — chọn service (auth/gateway) + file log, button "tail live" (SSE)
  - `AdminAuditPage.tsx` — lịch sử thao tác admin (read-only)
- **API layer**: `kmaedu-fe/src/apis/adminApi.ts` + `useAdminStore.ts`
- **Guard**: `AdminRoute.tsx` check `isAdmin` từ auth store
- **Routes**:
  - `/admin` (overview)
  - `/admin/users`
  - `/admin/stats`
  - `/admin/finance`
  - `/admin/logs`
  - `/admin/audit`
- **i18n**: chỉ tiếng Việt (admin user là người Việt)
- **UI stack**: antd (Table, Drawer, Modal, Form, Statistic, Card) + Radix primitives + Recharts (charts)
- **DESIGN SYSTEM UI:** `/kmaedu/DESIGN.md`

### Bảo mật

- Mọi endpoint admin phải qua `AdminGuard`
- Mọi thao tác tài chính + CRUD user có rủi ro phải ghi `AdminAudit` (lý do bắt buộc)
- Modal confirm 2 bước cho mọi action tài chính
- Log file redact: PII (email, token, password) phải mask trước khi hiển thị
- Rate limit trên `/api/v1/admin/*` để chống brute force (dùng `@nestjs/throttler`)

---

## What to Watch (rủi ro cần theo dõi khi thực thi)

1. **Thao tác tài chính** — cần test kỹ race condition: 2 admin cùng refund cùng payment → phải lock hoặc check status trước khi action
2. **Log file size** — log nhiều service dễ đầy disk. Cần logrotate (theo `x-logging` driver trong compose hiện đã có 10m × 3 files, OK)
3. **Performance query thống kê** — query aggregate trên `UserSession`/`Payment` nặng. Phải index đầy đủ (đã có sẵn phần lớn) và cache kết quả 5 phút (Redis)
4. **Bootstrap admin trong auth-service** — chỉ chạy 1 lần lúc boot. Nếu `ADMIN_EMAILS` thay đổi runtime → phải restart. Có thể thêm CLI command `bootstrap:admin` để re-sync
5. **Audit table tăng nhanh** — cần retention policy (vd: archive sau 1 năm). Phase sau, không cần MVP
6. **Admin cũng dùng** `/k/*` — frontend phải chắc chắn `AdminRoute` không cản truy cập các trang user thường (chỉ riêng `/admin/*` mới cần check)

---

## Success Criteria

- [ ] Admin đăng nhập từ email trong `ADMIN_EMAILS` → vào được `/admin`

- [ ] User thường truy cập `/admin` → bị redirect về `/k`

- [ ] Overview hiện 4 KPI: tổng user, user mới hôm nay, tổng doanh thu tháng, số Pro/VIP

- [ ] Trang users list/filter/grant isAdmin hoạt động

- [ ] Trang stats vẽ được chart user growth, traffic, revenue theo range date

- [ ] Trang finance refund/credit/tier thành công, ghi audit, hiện trong trang audit

- [ ] Trang logs đọc được log file auth + gateway, có nút "tail live"

- [ ] Mọi endpoint admin trả 401/403 nếu không phải admin

- [ ] Mọi thao tác tài chính có record trong AdminAudit

- [ ] `yarn build` + `yarn lint` pass cho cả 2 repo

- [ ] Test e2e: admin flow + 401 flow

---

## What Comes Next

1. **Phê duyệt bản thiết kế này** (bạn xác nhận)
2. Chạy `/tkm:create-plan` để tạo plan implementation chi tiết (theo 2-track: backend admin-service + frontend admin pages)
3. Plan sẽ theo MoMorph protocol: backend/Track B chạy trước API contracts, frontend/Track A chạy song song UI với mock data, integration phase cuối

---

## Unresolved Questions

Không còn. Tất cả 8 quyết định đã chốt.