# Phase 03 — Build + review + QA

**Priority:** Trung bình · **Status:** ✅ DONE · **Phụ thuộc:** phase-01,02

## Build
- ✅ `cd examio-app && ./gradlew :androidApp:compileDebugKotlin` → PASS
- ✅ `./gradlew :androidApp:assembleDebug` → exit 0

## Review
- ✅ `reviewer` DONE_WITH_CONCERNS — 1 fix important (extractSessionId strip query string ở nhánh parseDeepLink)

## QA thủ công (Android)
**Trạng thái:** ⏳ Chưa chạy (cần user)
- [ ] Tab Bài thi có nút "Tham gia phiên thi".
- [ ] Dán ID/link phiên công khai → landing hiện info → Bắt đầu → làm bài được.
- [ ] Phiên private có mã: nhập sai → lỗi; nhập đúng → Bắt đầu.
- [ ] Phiên private không thuộc quyền (denied) → thông báo chặn.
- [ ] Trong phòng mình: SessionCard "Vào làm bài" → vào làm bài (nếu trong giờ).
- [ ] Không hồi quy: MyExamsScreen mở lại attempt cũ, luồng nộp bài + kết quả vẫn chạy.

## Ghi chú
- iOS: nợ parity (làm sau).
- Deep link: deferred (chỉ manual paste phiên này).
