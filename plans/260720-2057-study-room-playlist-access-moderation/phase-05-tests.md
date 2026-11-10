# Phase 05 — Tests + Manual E2E (DONE)

## Context Links
- Plan: [plan.md](plan.md) · Depends: phase-03 (BE), phase-04 (FE)
- Jest: `cd kmaedu-be && yarn test --testPathPatterns="study-room"`; pattern spec sẵn trong module study-room

## Test Targets (backend unit)
1. **access / join** (`study-room.service.spec` mở rộng):
   - PUBLIC → auth join tạo member; WHITELIST ngoài list → Forbidden, trong list → OK; CODE giữ nguyên; banned → Forbidden mọi mode.
2. **playlist index normalize** (pure/state):
   - add append đúng order; remove item đang phát → currentIndex trỏ item kế / dừng khi rỗng; reorder giữ item hiện tại hợp lệ; jump kẹp trong biên.
3. **auto-advance leader guard** (gateway handler):
   - `media:ended` từ non-leader → bỏ qua; từ leader + index khớp → tăng index; index lệch → bỏ qua.
4. **permission/moderation**:
   - playlist:add theo `playlistAddPermission` (member bị chặn khi COHOST+/HOST); ban/mute chỉ COHOST+; không ban/mute được host/cohost; chat:send của muted bị từ chối.
5. **block**: block/unblock upsert đúng; snapshot myBlocks chứa blocked; unblock xoá.

## Steps
1. Viết spec theo trên (mock repo/redis như spec hiện có). `yarn test --testPathPatterns="study-room"` xanh.
2. Full `yarn test` — không vỡ suite khác (bỏ qua fail admin-stats phụ-thuộc-ngày đã biết, không liên quan).
3. FE `yarn lint && yarn build` xanh.
4. **Manual e2e** (2-3 browser, full stack): playlist add + auto-advance khi hết video + cohost next tay; đổi accessType (public/whitelist/code) verify join; chặn cá nhân (chỉ mình ẩn, reload còn); ban (bị đá + không vào lại) + mute (không chat được).

## Todo
- [ ] access/join spec
- [ ] playlist index normalize spec
- [ ] leader auto-advance guard spec
- [ ] permission/moderation spec
- [ ] block spec
- [ ] full suite + FE build xanh
- [ ] manual e2e checklist

## Success Criteria
- Specs mới xanh; suite cũ không vỡ; manual checklist tick đủ; hand cho reviewer.
