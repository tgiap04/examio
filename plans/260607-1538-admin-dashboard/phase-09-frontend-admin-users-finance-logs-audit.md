## Context links

- Parent plan: [plan.md](../plan.md)
- Research: [researcher-02-frontend.md](../research/researcher-02-frontend.md)
- Locked design: [brainstorm session record](../../reports/brainstorm-260607-1517-admin-dashboard.md) (Q2: SSE auth, Q3: antd Table, Q4: 2-step confirm)
- Design system: [DESIGN.md](../../../../DESIGN.md)
- AdminRoute: [examio-fe/src/routes/guards/AdminRoute.tsx](../../../../examio-fe/src/routes/guards/AdminRoute.tsx)
- adminApi: [examio-fe/src/apis/adminApi.ts](../../../../examio-fe/src/apis/adminApi.ts)
- useAdminStore: [examio-fe/src/stores/useAdminStore.ts](../../../../examio-fe/src/stores/useAdminStore.ts)
- Antd ConfigProvider: [examio-fe/src/provider/AppProviders.tsx](../../../../examio-fe/src/provider/AppProviders.tsx)
- Phase 02: [phase-02-frontend-foundation.md](phase-02-frontend-foundation.md)
- Phase 04: [phase-04-backend-admin-users-and-audit.md](phase-04-backend-admin-users-and-audit.md)
- Phase 06: [phase-06-backend-admin-finance.md](phase-06-backend-admin-finance.md)
- Phase 07: [phase-07-backend-admin-logs-and-gateway.md](phase-07-backend-admin-logs-and-gateway.md)

## Overview

- **Date:** 2026-06-07
- **Track:** Frontend (F)
- **Priority:** P0 (largest frontend surface — 4 pages, 7 components)
- **Implementation status:** pending
- **Review status:** pending

4 trang admin còn lại: Users (DataTable với filter), Finance (3 modal action với 2-step confirm), Logs (SSE live tail), Audit (read-only history). Component shared: UserTable, FinanceActionModal, LogViewer.

## Key Insights

- 4 trang dùng `useAdminStore` + `adminApi` từ phase 02.
- 3 finance action cần 2-step confirm (recommendation Q4): `Modal.confirm` thường + real modal với antd `Form` rules.
- SSE auth (Q2 confirmed): `?ticket=` query (ticket issued bởi `POST /admin/logs/ticket`, TTL 300s, single-use). EventSource URL: `${API_BASE}/admin/logs/stream?service=auth&ticket=${ticket}`. Frontend tự refresh ticket khi SSE nhận 401.
- EventSource reconnect với backoff 1/2/5/30s, max 5 retries (theo research).
- antd `Popconfirm` cho ban action (1-step, ít rủi ro).
- `useAdminStore.invalidate*` gọi sau mỗi mutation để refetch dependent data.

## Requirements

**Functional**

`AdminUsersPage`:
- antd `Table` với columns: email, username, isAdmin, isVerified, isBanned, createdAt, actions
- Filter form (top): search (debounce 300ms), role Select (admin/user/teacher), status Select (active/banned/verified), created range
- Pagination: `pageSize: 20, showSizeChanger, pageSizeOptions: [10, 20, 50, 100]`
- Row actions: `Popconfirm` ban, button "Cấp quyền admin" / "Thu hồi quyền admin" (block nếu self), button "Xem chi tiết" (mở `Drawer`)
- Drawer detail: full profile + wallet + subscription + last session
- Loading skeleton + error state

`AdminFinancePage`:
- Header: 3 button trigger modal (Refund, Cộng/trừ credits, Đổi tier)
- Body: table recent audit của finance actions (limit 50)
- `FinanceActionModal` component:
  - 2-step: `Modal.confirm` (warning) → real modal với antd `Form`
  - Fields: type-specific (paymentId cho refund, userId + amount + direction cho credit, userId + tier + billingCycle cho tier)
  - Reason bắt buộc, min 10 chars
  - Submit → call `adminApi.refundApi/creditApi/setTierApi()` → invalidate stats cache → close modal → show success toast
- Error handling: 409 (conflict) → "Thao tác đã được thực hiện bởi admin khác"

`AdminLogsPage`:
- Service selector: `Select<'auth' | 'gateway'>` mặc định 'auth'
- Button "Tail trực tiếp" → mở EventSource connection
- `LogViewer` component: virtual scroll (react-window hoặc simple list), mỗi line monospace, PII đã redact ở backend
- Reconnect logic với backoff 1/2/5/30s, max 5 retries
- "Dừng" button → close EventSource
- Recent log button: fetch `/admin/logs/recent?service=...&limit=100` → render static

`AdminAuditPage`:
- antd `Table` với columns: createdAt, admin email, action, target user, reason, payload (expand row)
- Filters: adminId Select (từ list users có isAdmin), action Select, date range
- Pagination 50/page
- Read-only — không có action buttons
- Export CSV button (optional)

**Non-functional**
- 2-step confirm block submit khi chưa điền reason
- Modal close on Escape hoặc click outside
- EventSource cleanup khi component unmount
- Error toast cho mọi API failure
- Loading state riêng cho mỗi action (button loading, không block UI)

## Architecture

```
examio-fe/src/pages/admin/
  AdminUsersPage.tsx
  AdminFinancePage.tsx
  AdminLogsPage.tsx
  AdminAuditPage.tsx
examio-fe/src/components/admin/
  UserTable.tsx
  UserDetailDrawer.tsx
  FinanceActionModal.tsx
  LogViewer.tsx
  EventSourceProvider.tsx           ← manages SSE lifecycle
  AuditTable.tsx
examio-fe/src/hooks/
  useEventSource.ts                ← reconnect logic
examio-fe/src/locales/vi/
  admin.json                       ← extend
```

`FinanceActionModal` 2-step:
```tsx
export function FinanceActionModal({ type, open, onClose }: Props) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async () => {
    const values = await form.validateFields();
    Modal.confirm({
      title: 'Xác nhận thao tác tài chính',
      content: `Bạn sắp ${type} cho user. Hành động này không thể hoàn tác.`,
      okText: 'Xác nhận',
      cancelText: 'Hủy',
      okButtonProps: { danger: type === 'refund' || type === 'subtract' },
      onOk: async () => {
        setLoading(true);
        try {
          if (type === 'refund') await refundApi(values);
          if (type === 'credit') await creditApi(values);
          if (type === 'tier') await setTierApi(values);
          message.success('Thao tác thành công');
          useAdminStore.getState().invalidateOverview();
          useAdminStore.getState().invalidateSeries();
          useAdminStore.getState().invalidateAudit();
          onClose();
        } catch (err) {
          message.error(err.message);
        } finally {
          setLoading(false);
        }
      },
    });
  };
  
  return (
    <Modal open={open} onCancel={onClose} title={...} confirmLoading={loading}>
      <Form form={form} onFinish={handleSubmit}>
        {/* type-specific fields */}
        <Form.Item name="reason" label="Lý do" rules={[{ required: true, min: 10, max: 500 }]}>
          <Input.TextArea rows={3} maxLength={500} showCount />
        </Form.Item>
        <Button type="primary" htmlType="submit">Tiếp tục</Button>
      </Form>
    </Modal>
  );
}
```

`useEventSource` hook:
```tsx
export function useEventSource(url: string | null, options: { onMessage, onError, reconnectBackoff = [1000, 2000, 5000, 30000] }) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'open' | 'error' | 'closed'>('idle');
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  
  useEffect(() => {
    if (!url) return;
    setStatus('connecting');
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;
    
    es.onopen = () => { setStatus('open'); retryRef.current = 0; };
    es.onmessage = (e) => options.onMessage(JSON.parse(e.data));
    es.onerror = () => {
      setStatus('error');
      es.close();
      const delay = options.reconnectBackoff[Math.min(retryRef.current, options.reconnectBackoff.length - 1)];
      retryRef.current += 1;
      if (retryRef.current > 5) {
        setStatus('closed');
        return;
      }
      setTimeout(() => { /* re-trigger effect by setting state */ }, delay);
    };
    
    return () => { es.close(); setStatus('closed'); };
  }, [url]);
  
  return { status };
}
```

## Related code files

**New:**
- `examio-fe/src/pages/admin/AdminUsersPage.tsx`
- `examio-fe/src/pages/admin/AdminFinancePage.tsx`
- `examio-fe/src/pages/admin/AdminLogsPage.tsx`
- `examio-fe/src/pages/admin/AdminAuditPage.tsx`
- `examio-fe/src/components/admin/UserTable.tsx`
- `examio-fe/src/components/admin/UserDetailDrawer.tsx`
- `examio-fe/src/components/admin/FinanceActionModal.tsx`
- `examio-fe/src/components/admin/LogViewer.tsx`
- `examio-fe/src/components/admin/AuditTable.tsx`
- `examio-fe/src/hooks/useEventSource.ts`
- `examio-fe/src/hooks/useDebounce.ts` (cho search filter)

**Modify:**
- `examio-fe/src/locales/vi/admin.json` — extend với users/finance/logs/audit keys
- `examio-fe/src/stores/useAdminStore.ts` — thêm `invalidateAudit()`, `invalidateUsers()`

## Implementation Steps

1. **AdminUsersPage**:
   - Fetch users qua `adminApi.listUsersApi({ page, pageSize, search, isAdmin, isVerified, isBanned, createdFrom, createdTo })`
   - Table columns: email, username, isAdmin (Tag), isVerified (Tag), isBanned (Tag), createdAt (relative time), actions (buttons)
   - Filter form: search Input (debounce 300ms), isAdmin Select, isBanned Select, DateRangePicker
   - Ban: `Popconfirm` → call `banUserApi(id)` → invalidate
   - Grant/Revoke admin: button (disabled nếu self) → call `grantAdminApi(id)` / `revokeAdminApi(id)` → invalidate
   - Click row → mở `UserDetailDrawer`
2. **UserDetailDrawer** — antd `Drawer` width 600. Hiện: email, username, name, isAdmin, isVerified, isBanned, createdAt, wallet balance, subscription tier, last session (device + IP). Close button.
3. **AdminFinancePage**:
   - 3 button top: "Hoàn tiền", "Điều chỉnh credits", "Đổi gói subscription"
   - Click → mở `FinanceActionModal` với `type` tương ứng
   - Recent actions table (fetch `listAuditApi({ action: { in: ['admin.finance.refund', 'admin.finance.credit', 'admin.finance.tier_change'] }, pageSize: 50 })`)
4. **FinanceActionModal**:
   - Props: `type: 'refund' | 'credit' | 'tier'`, `open`, `onClose`
   - Render fields dựa trên type:
     - refund: paymentId Input
     - credit: userId Input, amount InputNumber, direction Radio (ADD/SUBTRACT)
     - tier: userId Input, tier Select, billingCycle Select
   - Reason TextArea (min 10, max 500, showCount)
   - 2-step: form submit → `Modal.confirm` warning → onOk gọi API
   - Loading state riêng cho confirm button
5. **AdminLogsPage**:
   - Service `Select` (auth/gateway) + button "Tail trực tiếp" + button "Tải 100 dòng gần nhất"
   - `LogViewer` hiện lines: monospace, dark background, scrollable
   - `useEventSource` hook manage SSE
6. **useEventSource hook** — implement reconnect logic như trên
7. **AdminAuditPage**:
   - Fetch `listAuditApi({ page, pageSize, adminId, action, createdFrom, createdTo })`
   - Table columns: createdAt, admin (email lookup), action (Tag color-coded), target (user ID), reason, payload (expandable row)
   - Filter form: admin Select (fetched từ users), action Select (enum), date range
8. **Locale keys** — extend `vi/admin.json` cho tất cả 4 trang
9. **Cache invalidation** — sau mỗi mutation (ban, grant, refund, credit, tier), gọi `useAdminStore.getState().invalidate*()`
10. **Lint + build** — `yarn lint && yarn build`
11. **Manual test** — admin login → mỗi trang → test 1 action end-to-end

## Todo list

- [ ] Tạo `useDebounce.ts` hook
- [ ] Tạo `useEventSource.ts` hook với reconnect
- [ ] Tạo `UserTable.tsx` với filter + actions
- [ ] Tạo `UserDetailDrawer.tsx`
- [ ] Tạo `AdminUsersPage.tsx`
- [ ] Tạo `FinanceActionModal.tsx` (2-step confirm + type-specific fields)
- [ ] Tạo `AdminFinancePage.tsx` (3 trigger + recent table)
- [ ] Tạo `LogViewer.tsx` (monospace scroll)
- [ ] Tạo `AdminLogsPage.tsx` (service select + tail button)
- [ ] Tạo `AuditTable.tsx` (expandable row)
- [ ] Tạo `AdminAuditPage.tsx` (filter + table)
- [ ] Extend `vi/admin.json` cho 4 trang
- [ ] Add `invalidateAudit()`, `invalidateUsers()` vào `useAdminStore`
- [ ] Cache invalidation sau mỗi mutation
- [ ] `yarn lint` pass
- [ ] `yarn build` pass
- [ ] Manual: AdminUsers — search, filter, ban, grant admin, view detail
- [ ] Manual: AdminFinance — refund 1 payment, credit 100 ADD, set tier 2
- [ ] Manual: AdminLogs — open tail, see live lines, stop
- [ ] Manual: AdminAudit — filter theo action, see expandable payload
- [ ] Verify non-admin → redirect `/k` (không vào được admin pages)

## Success Criteria

- [ ] AdminUsers: search debounce 300ms, filter chính xác, ban action xong reload table, audit row visible
- [ ] AdminUsers: self-revoke-admin button disabled với tooltip "Không thể revoke chính mình"
- [ ] AdminFinance: 2-step confirm hiện warning trước khi submit
- [ ] AdminFinance: refund với reason ≥ 10 chars → success, wallet update, audit row
- [ ] AdminFinance: refund với reason < 10 chars → form validation error, không submit
- [ ] AdminLogs: tail auth service → see live lines trong < 1s
- [ ] AdminLogs: PII trong log → masked `[REDACTED]`
- [ ] AdminLogs: disconnect internet → reconnect với backoff 1/2/5/30s, max 5 retries
- [ ] AdminLogs: stop button → close EventSource, no error
- [ ] AdminAudit: filter theo adminId + action → rows update
- [ ] AdminAudit: payload expandable row hiện JSON formatted
- [ ] Cache invalidation: finance mutation → overview/stats page tự refetch
- [ ] Vietnamese labels render đúng
- [ ] Non-admin → redirect `/k` (test 401 case)

## Risk Assessment

| Risk | Mitigation |
|---|---|
| 2-step confirm bị bypass nếu dùng `Modal.confirm` programmatically | Double-check submit handler — Modal.confirm chỉ hiện warning, onOk thực sự gọi API |
| EventSource không auto-reconnect khi network blip | `useEventSource` hook có manual backoff retry |
| `?token=` query có thể log trong nginx/CDN | Document rủi ro; phase 2 refactor sang ticket exchange |
| antd Table render chậm với > 1000 rows | Server-side pagination, max pageSize 100 |
| `Form.validateFields` return rejected → silent fail | Wrap trong try/catch, show error toast |
| User click "X" đóng modal giữa chừng form dirty | antd `confirmClose` mặc định OK, không cần extra logic |
| `useEventSource` cleanup leak khi component unmount mid-connect | `useEffect` cleanup return `es.close()` |

## Security Considerations

- **Critical:** 2-step confirm bắt buộc cho mọi finance action — chống fat-finger.
- **Critical:** reason ≥ 10 chars — audit trail có ngữ cảnh.
- **Critical:** `?token=` query chỉ dùng cho SSE log stream, không dùng cho finance endpoints (vẫn Bearer header).
- Không log token ở console.
- PII redaction backend đã handle; frontend không double-redact.
- Self-revoke admin button disabled — chống lockout.

## Next steps

- Phase 10 (integration) — replace mock data, e2e test full flow qua UI.
