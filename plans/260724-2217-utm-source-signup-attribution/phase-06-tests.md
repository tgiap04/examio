# Phase 06 — Tests + verify

**Priority:** Medium · **Status:** pending · **Depends on:** 2,3,4,5

## Overview
Khoá hành vi bằng test + chạy build/lint/test cả FE lẫn BE.

## Related Code Files
- Create/extend: test cho `admin-stats.service` (`getSourceBreakdown`).
- Create/extend: test cho auth register ghi `utmSource`.
- Create: test FE cho `src/lib/utmSource.ts` (first-touch không ghi đè, whitelist).

## Implementation Steps
1. **BE admin-stats**: unit test `getSourceBreakdown` — mock query trả rows → map đúng, COALESCE
   'direct' cho null/'' , sắp giảm dần, LIMIT áp dụng; cache hit lần 2 (mock redis).
2. **BE auth**: test nhánh email register truyền `utmSource` → `user.create` nhận đúng field;
   test không có utm → undefined/null; (OAuth: test parse/sanitize state → utm_source hợp lệ).
3. **FE utmSource.ts**: test `captureUtmSource` chỉ ghi khi CHƯA có (first-touch), whitelist loại
   giá trị rác/dài >64, `get/clear` đúng. (jsdom localStorage + window.location.search).
   Lưu ý: FE hiện chưa có script test — nếu chưa cấu hình test runner, ghi rõ và tối thiểu đảm bảo
   `yarn build` (tsc) xanh; cân nhắc thêm vitest nếu trong phạm vi.
4. **Verify**:
   - BE: `yarn build admin-service`, `yarn build auth-service`, `yarn test` (các suite liên quan).
   - FE: `yarn build` (tsc+vite), `yarn lint` trên file đã sửa.
   - Manual e2e: `?utm_source=unikorn` → đăng ký email + Google → kiểm DB `User.utmSource`;
     `/admin/stats` + `/admin` hiện đúng.

## Todo
- [ ] Test `getSourceBreakdown` (map, COALESCE direct, order, limit, cache)
- [ ] Test register ghi utmSource (có / không)
- [ ] Test `utmSource.ts` first-touch + whitelist
- [ ] Build+lint BE (admin, auth) + FE xanh
- [ ] Manual e2e email + Google attribution

## Success Criteria
- Test mới xanh; build/lint FE+BE xanh; e2e xác nhận attribution đúng cả 2 luồng đăng ký.

## Notes
- Migration additive đã sinh ở Phase 1 — xác nhận áp được lên DB dev trước e2e.
