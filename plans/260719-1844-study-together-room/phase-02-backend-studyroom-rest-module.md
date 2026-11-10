# Phase 02 — Backend REST Module (CRUD / Join / Leaderboard)

## Context Links

- Plan: [plan.md](plan.md) · Depends: phase-01
- Pattern tham chiếu: `kmaedu-be/apps/exam-service/src/modules/examroom/` (controller + service + repository + dto), `examsession.controller.ts` verify-code flow, AuthGuard từ `@kmaedu/common`

## Overview

- **Priority:** High · **Status:** ✓ done
- Module `study-room` mới trong exam-service: REST cho vòng đời phòng + membership + leaderboard. Chưa có WS ở phase này.
- All endpoints implemented; invite code 6-digit generation with retry; role-based access control via `assertRole` helper.

## Requirements

- CRUD phòng (host-only cho update/delete); mã mời 6 số sinh server-side, regenerate được.
- Join bằng mã mời → tạo `StudyRoomMember` (role MEMBER); host tạo phòng → member role HOST.
- Chặn join khi: phòng `isActive=false`, đã đủ `maxParticipants`, hoặc đã là member (idempotent — trả về phòng luôn).
- Leaderboard: members sắp theo `totalFocusSeconds` desc.
- DTO validate bằng `nestjs-zod` (khớp pattern module hiện có); Prisma access qua repository.

## Architecture — files to create

```
kmaedu-be/apps/exam-service/src/modules/study-room/
├── study-room.module.ts
├── study-room.controller.ts        # @Controller('studyrooms'), AuthGuard
├── study-room.service.ts           # business logic (giữ <200 dòng, tách helper nếu phình)
├── study-room.repository.ts        # Prisma access
└── dto/study-room.dto.ts           # CreateStudyRoomDto, UpdateStudyRoomDto, JoinByCodeDto
```

Đăng ký `StudyRoomModule` vào `ExamServiceModule`.

## Endpoints

| Method | Route | Ai | Mô tả |
|---|---|---|---|
| POST | `studyrooms` | auth | Tạo phòng (sinh inviteCode 6 số, unique-retry); tạo member HOST |
| GET | `studyrooms/mine` | auth | Phòng tôi host + phòng tôi là member (include host, `_count.members`) |
| GET | `studyrooms/:id` | member | Chi tiết phòng + members (include user: id, name, avatar) |
| PUT | `studyrooms/:id` | HOST | Sửa name/description/config Pomodoro/maxParticipants/isActive |
| DELETE | `studyrooms/:id` | HOST | Xoá phòng (cascade members) |
| POST | `studyrooms/join` | auth | Body `{inviteCode}` → join, trả về phòng |
| POST | `studyrooms/:id/leave` | member | Rời phòng (HOST không leave được — phải delete hoặc chuyển host: ngoài scope, chặn với message rõ) |
| POST | `studyrooms/:id/regenerate-code` | HOST | Đổi mã mời |
| GET | `studyrooms/:id/leaderboard` | member | Members order by totalFocusSeconds desc |

## Implementation Steps

1. Tạo repository: findById (include members+user select gọn), findByInviteCode, findMine (1 query — dùng `OR: [{hostId}, {members: {some: {userId}}}]`, KHÔNG N+1), create (nested create member HOST), update, delete, joinMember (upsert theo `@@unique`), countMembers.
2. Service: sinh inviteCode `Math.floor(100000 + Math.random()*900000)` retry khi trùng; guard role bằng helper `assertRole(roomId, userId, minRole)` — dùng lại ở phase 4.
3. Controller + DTO zod: `workMinutes 1–180`, `breakMinutes 1–60`, `longBreakMinutes 1–60`, `cyclesBeforeLongBreak 1–12`, `maxParticipants 2–20`, `name 1–100`.
4. `yarn build` + smoke qua `yarn dev:exam`.

## Todo

- [x] Module/controller/service/repository/dto
- [x] Đăng ký vào ExamServiceModule
- [x] Role guard helper `assertRole`
- [x] STUDY_ROOM added to libs/common CACHE_MODULES
- [x] Build + smoke

## Success Criteria

- Tạo/join/leave/leaderboard hoạt động qua HTTP trực tiếp exam-service; join sai mã → 404, phòng đầy → 409, đã member → idempotent 200.

## Security

- Mọi route sau AuthGuard; detail/leaderboard chỉ cho member; mutation chỉ HOST. Không lộ inviteCode trong response cho MEMBER (chỉ HOST/COHOST thấy).
