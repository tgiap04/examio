# Phase 04 — Build verify + QA thủ công

**Priority:** Trung bình · **Status:** ✅ BUILD PASS, QA PENDING · **Phụ thuộc:** phase-01→03

## Mục tiêu
Đảm bảo build Android sạch và luồng chạy đúng end-to-end.

## Build
- [x] `cd examio-app && ./gradlew :androidApp:assembleDebug` → exit 0 ✅
- [x] `compileDebugKotlin` → PASS ✅
- No new critical warnings from new code.

## QA thủ công (checklist)
- [ ] Tab Đề thi có mục "Quản lý phòng thi", mở ra danh sách phòng.
- [ ] Tạo phòng: thiếu title → báo lỗi; chọn bộ đề + title → tạo thành công, phòng hiện trong list.
- [ ] Mở chi tiết phòng: header đúng, danh sách phiên (rỗng ban đầu).
- [ ] Tạo phiên công khai (chỉ set thời gian) → thành công, hiện trong list phiên.
- [ ] Tạo phiên mã số: nút random ra 6 số, tạo thành công.
- [ ] Cấu hình câu hỏi RANDOM_TOTAL / RANDOM_BY_LABEL gửi đúng, không lỗi 400.
- [ ] Xóa phòng / xóa phiên hoạt động, list cập nhật.
- [ ] Token hết hạn giữa chừng → về login (AuthInterceptor sẵn có).

## Giao cho subagent
- `tester` (nếu có test), `reviewer` (bắt buộc — inspect code), `debugger` nếu lỗi runtime.

## Success criteria
Build pass + checklist QA pass. Không hồi quy các màn cũ (DeThi bộ đề, AI generate).

## Hoàn thành thực tế (07/08)
- Build: ✅ PASS (exit 0)
- Reviewer: ✅ DONE_WITH_CONCERNS — 2 critical fixes applied (whitelist search race + isActive→status field). 1 medium concern (DatePicker UTC init) noted and fixed.
- Manual QA on device: ⏳ PENDING (awaits user device test).

## Ghi chú
- iOS Swift: **DEFERRED** → tạo follow-up issue cho phiên sau (feature parity: copy AndroidApp UI + wiring + QA).
- QA manual cần kiểm tra trên thiết bị thực (emulator tốt nhất là API 30+).
- Không hồi quy: kiểm tra tab "Đề thi" bộ đề + AI generate còn hoạt động bình thường.
