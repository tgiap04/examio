# Phase 04 — Frontend: bắt & giữ utm_source (first-touch)

**Priority:** High · **Status:** pending · **Depends on:** 2

## Overview
Bắt `utm_source` lúc load đầu, giữ first-touch qua localStorage, gửi kèm khi đăng ký (email + Google).

## Related Code Files
- Create: `examio-fe/src/lib/utmSource.ts` (mẫu `src/lib/authRedirect.ts` set/get/clear).
- Modify: `examio-fe/src/provider/AppProviders.tsx` — gọi capture lúc first-load (cạnh
  `AuthSyncBootstrap`/`useAuthSync`).
- Modify: form đăng ký email (`src/components/organisms/auth/signup-form.tsx`) — gửi `utmSource`
  trong payload, `clear()` khi đăng ký thành công.
- Modify: điểm bấm "Đăng nhập Google" (nút OAuth redirect, dùng `NEXT_PUBLIC_API_URL`) — nối
  `utm_source` vào URL khởi tạo OAuth (khớp cơ chế `state` chốt ở Phase 2).
- Có thể chạm: `src/stores/useAuthStore.ts` (nếu register/OAuth đi qua store).

## Implementation Steps
1. `utmSource.ts`:
   ```ts
   const KEY = "examio:utm_source";
   const clean = (v: string | null) =>
     v && /^[\w.-]{1,64}$/.test(v) ? v : null;             // whitelist + cap 64
   export function captureUtmSource() {                    // first-touch: chỉ ghi nếu chưa có
     const v = clean(new URLSearchParams(window.location.search).get("utm_source"));
     if (v && !localStorage.getItem(KEY)) localStorage.setItem(KEY, v);
   }
   export const getUtmSource = () => clean(localStorage.getItem(KEY));
   export const clearUtmSource = () => localStorage.removeItem(KEY);
   ```
2. `AppProviders.tsx`: gọi `captureUtmSource()` một lần lúc mount (effect cạnh AuthSync). Không strip
   khỏi URL (GA chỉ đọc pathname; giữ URL nguyên đơn giản hơn).
3. Signup email: đưa `getUtmSource()` vào payload register; `clearUtmSource()` sau khi thành công.
4. OAuth Google: khi build URL redirect, nếu `getUtmSource()` có → thêm `&utm_source=<v>` (hoặc gói
   vào `state` theo cơ chế Phase 2). `clear()` sau khi OAuth hoàn tất (hoặc để TTL tự nhiên — chốt
   khi code; ưu tiên clear ở màn callback thành công).

## Todo
- [ ] `src/lib/utmSource.ts` (capture first-touch / get / clear + whitelist + cap 64)
- [ ] Hook capture ở AppProviders (first-load)
- [ ] Signup email gửi utmSource + clear khi thành công
- [ ] Nút Google OAuth nối utm_source theo cơ chế Phase 2

## Success Criteria
- Vào `?utm_source=unikorn` → localStorage `examio:utm_source='unikorn'`; vào lại `?utm_source=other`
  KHÔNG ghi đè (first-touch); đăng ký email/Google gửi đúng giá trị; clear sau đăng ký.

## Notes
- Whitelist charset ở FE là UX/vệ sinh; BE (Phase 2) vẫn phải sanitize lại (không tin client).
