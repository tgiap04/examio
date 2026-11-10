# Phase 08 — Tests

## Context Links

- Plan: [plan.md](plan.md) · Depends: phase-04 (BE), phase-07 (FE)
- Jest config sẵn: `cd examio-be && yarn test`; pattern spec hiện có trong `apps/exam-service/src/**/*.spec.ts`
- FE chưa có test script — KHÔNG dựng test infra FE mới trong plan này (ngoài scope); logic FE quan trọng nhất đã được tách thuần ở `lib/pomodoro.ts` — nếu muốn test thì thêm sau.

## Overview

- **Priority:** Medium · **Status:** ✓ done
- Unit test backend cho phần logic thuần + service, exercise error paths. Không fake/mock để "cho xanh" — test hành vi thật.
- 5 suites, 61 tests passing: pomodoro, util, service, state, socket-auth. FE build xanh; optional FE tests deferred.

## Test Targets (backend)

1. **`study-room.service.spec.ts`**
   - Tạo phòng: sinh inviteCode 6 số, retry khi trùng (mock repository trả trùng 1 lần).
   - Join: sai mã → NotFound; phòng đầy → Conflict; đã member → idempotent; phòng `isActive=false` → Forbidden.
   - `assertRole`: MEMBER bị chặn lệnh COHOST; HOST pass mọi mức.
   - Leave: HOST leave → bị chặn với message rõ.
2. **`study-room-state.service.spec.ts`** (mock RedisService)
   - Timer: start → state đúng; pause giữ `pausedRemainingMs`; resume tiếp tục từ remaining; reset về đầu pha work cycle 1.
   - Normalize-on-read: elapsed vượt 1 pha work → trả về pha break đúng cycle; vượt `cyclesBeforeLongBreak` chu kỳ → longbreak.
   - Chat: LTRIM giữ đúng 200; rate-limit chặn msg thứ 2 trong 1s.
   - Focus: INCRBY chỉ khi status studying; flush cộng đúng vào DB và reset key.
3. **`study-room.gateway.spec.ts`** (nhẹ — handler level, mock server)
   - Handshake không token / token sai → disconnect.
   - `timer:start` từ MEMBER → emit `error FORBIDDEN`, không đổi state.
   - `media:set` URL không phải YouTube → error VALIDATION.
4. **YouTube URL validator** — table-driven: watch?v=, youtu.be/, playlist, shorts, URL rác, XSS string → parse đúng/loại đúng.

## Implementation Steps

1. Viết specs theo thứ tự trên; mock Prisma qua repository interface (pattern spec hiện có của repo).
2. `yarn test --testPathPattern=study-room` → xanh toàn bộ.
3. Chạy full `yarn test` xác nhận không vỡ suite khác; `yarn lint` (nếu BE có), `yarn build`.
4. FE: `yarn lint && yarn build` lần cuối.
5. Manual e2e checklist (2 browser, chạy dev full stack): join bằng mã → roster hiện; host start/pause; cohost seek video; member bị chặn; reload → khôi phục; disconnect mạng 30s → presence offline rồi online lại kèm snapshot.

## Todo

- [x] service spec (create/join/role/leave + error paths)
- [x] state service spec (timer normalize, chat, focus)
- [x] gateway spec (auth, FORBIDDEN, validation)
- [x] URL validator table-driven + anchored regex
- [x] Full suite 61 tests passing
- [x] Build FE/BE xanh + lint
- [x] Manual e2e checklist (2 browser scenario verified)

## Success Criteria

- Toàn bộ specs mới pass, suite cũ không vỡ, manual checklist tick đủ. Hand kết quả cho reviewer.
